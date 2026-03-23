"""
Database adapters for Supabase and SQLite providers.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from agno.utils.log import logger
from sqlalchemy import MetaData, and_, create_engine, delete, func, inspect, or_, select, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.postgresql import insert as postgres_insert

from ..models.db import DbFilter, DbQueryRequest, DbQueryResponse
from .db_registry import ProviderConfig
from .sqlite_schema import SCHEMA_STATEMENTS


def _utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


JSON_COLUMNS: dict[str, set[str]] = {
    "agents": {"tool_ids", "skill_ids"},
    "conversations": {"title_emojis", "session_summary"},
    "conversation_messages": {
        "content",
        "tool_calls",
        "tool_call_history",
        "research_step_history",
        "related_questions",
        "sources",
        "document_sources",
        "grounding_supports",
        "pipeline_trace",
        "stream_blocks",
    },
    "conversation_events": {"payload"},
    "attachments": {"data"},
    "memory_domains": {"aliases"},
    "user_tools": {"config", "input_schema"},
    "pending_form_runs": {"requirements_data", "messages"},
    "scrapbook": {"tags"},
}

TABLES_WITH_ID = {
    "spaces",
    "agents",
    "conversations",
    "conversation_messages",
    "conversation_events",
    "attachments",
    "space_documents",
    "home_notes",
    "home_shortcuts",
    "memory_domains",
    "memory_summaries",
    "user_tools",
    "pending_form_runs",
    "email_provider_configs",
    "email_notifications",
    "scrapbook",
}

TABLES_WITH_UPDATED_AT = {
    "spaces",
    "agents",
    "conversations",
    "space_documents",
    "home_notes",
    "home_shortcuts",
    "user_settings",
    "memory_domains",
    "memory_summaries",
    "user_tools",
    "email_provider_configs",
    "scrapbook",
}

TABLES_WITH_CREATED_AT = {
    "spaces",
    "agents",
    "conversations",
    "conversation_messages",
    "conversation_events",
    "attachments",
    "space_documents",
    "conversation_documents",
    "space_agents",
    "home_notes",
    "home_shortcuts",
    "memory_domains",
    "memory_summaries",
    "user_tools",
    "pending_form_runs",
    "email_provider_configs",
    "email_notifications",
    "scrapbook",
}


def _serialize_value(table: str, column: str, value: Any) -> Any:
    if value is None:
        return None
    if table in JSON_COLUMNS and column in JSON_COLUMNS[table]:
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return json.dumps(str(value), ensure_ascii=False)
    if isinstance(value, bool):
        return 1 if value else 0
    return value


def _deserialize_row(table: str, row: dict[str, Any]) -> dict[str, Any]:
    if table in JSON_COLUMNS:
        for column in JSON_COLUMNS[table]:
            if column in row and row[column] is not None:
                try:
                    row[column] = json.loads(row[column])
                except Exception:
                    pass
    # SQLite stores bool as int
    for key, value in row.items():
        if isinstance(value, int) and key.startswith("is_"):
            row[key] = bool(value)
    return row


def _prepare_payload(table: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {key: _serialize_value(table, key, value) for key, value in payload.items()}


def _deserialize_rows(table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_deserialize_row(table, dict(row)) for row in rows]


def _normalize_columns(columns: str | list[str] | None) -> list[str] | None:
    if columns is None:
        return None
    if isinstance(columns, list):
        return columns
    if isinstance(columns, str):
        trimmed = columns.strip()
        if trimmed == "*":
            return None
        return [col.strip() for col in trimmed.split(",") if col.strip()]
    return None


def _build_where_clause(filters: list[DbFilter] | None) -> tuple[str, list[Any]]:
    if not filters:
        return "", []

    def build(f: DbFilter) -> tuple[str, list[Any]]:
        if f.op == "or" and f.filters:
            or_clauses: list[str] = []
            or_params: list[Any] = []
            for inner in f.filters:
                clause, params = build(inner)
                if clause:
                    or_clauses.append(clause)
                    or_params.extend(params)
            if not or_clauses:
                return "", []
            return f"({ ' OR '.join(or_clauses) })", or_params

        column = f.column
        if not column:
            return "", []
        if f.op == "eq":
            return f"{column} = ?", [f.value]
        if f.op == "gt":
            return f"{column} > ?", [f.value]
        if f.op == "lt":
            return f"{column} < ?", [f.value]
        if f.op == "ilike":
            return f"LOWER({column}) LIKE LOWER(?)", [f"%{f.value}%"]
        if f.op == "is_null":
            return f"{column} IS NULL", []
        if f.op in {"in", "not_in"}:
            values = f.values or []
            if not values:
                return ("1=0", []) if f.op == "in" else ("1=1", [])
            placeholders = ", ".join(["?"] * len(values))
            operator = "IN" if f.op == "in" else "NOT IN"
            return f"{column} {operator} ({placeholders})", list(values)
        return "", []

    clauses: list[str] = []
    params: list[Any] = []
    for filt in filters:
        clause, clause_params = build(filt)
        if clause:
            clauses.append(clause)
            params.extend(clause_params)
    if not clauses:
        return "", []
    return "WHERE " + " AND ".join(clauses), params


def _extract_filter_values(filters: list[DbFilter] | None, column: str) -> list[str]:
    if not filters:
        return []
    values: list[str] = []

    def walk(f: DbFilter) -> None:
        if f.op == "or" and f.filters:
            for inner in f.filters:
                walk(inner)
            return
        if f.column != column:
            return
        if f.op == "eq" and f.value is not None:
            values.append(str(f.value))
            return
        if f.op == "in" and f.values:
            for item in f.values:
                if item is not None:
                    values.append(str(item))

    for filt in filters:
        walk(filt)
    return list(dict.fromkeys(values))


def _build_sa_expression(table_obj, filt: DbFilter):
    if filt.op == "or" and filt.filters:
        expressions = [_build_sa_expression(table_obj, inner) for inner in filt.filters]
        expressions = [expr for expr in expressions if expr is not None]
        return or_(*expressions) if expressions else None

    column_name = filt.column
    if not column_name or column_name not in table_obj.c:
        return None
    column = table_obj.c[column_name]

    if filt.op == "eq":
        return column == filt.value
    if filt.op == "gt":
        return column > filt.value
    if filt.op == "lt":
        return column < filt.value
    if filt.op == "ilike":
        return column.ilike(f"%{filt.value}%")
    if filt.op == "is_null":
        return column.is_(None)
    if filt.op == "in":
        return column.in_(filt.values or [])
    if filt.op == "not_in":
        return ~column.in_(filt.values or [])
    return None


@dataclass
class SQLiteAdapter:
    config: ProviderConfig

    def __post_init__(self) -> None:
        self._lock = threading.Lock()
        if not self.config.sqlite_path:
            raise ValueError("SQLite provider missing path")
        os.makedirs(os.path.dirname(self.config.sqlite_path) or ".", exist_ok=True)
        self._conn = sqlite3.connect(
            self.config.sqlite_path,
            check_same_thread=False,
            timeout=5.0,
        )
        self._conn.row_factory = sqlite3.Row
        self._configure_connection()
        self._ensure_schema()

    def _configure_connection(self) -> None:
        """
        Tune SQLite for mixed read/write concurrency.
        """
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.execute("PRAGMA temp_store=MEMORY;")
            self._conn.commit()

    def _ensure_schema(self) -> None:
        with self._lock:
            cursor = self._conn.cursor()
            for stmt in SCHEMA_STATEMENTS:
                cursor.executescript(stmt)
            # Lightweight forward migrations for existing local DBs.
            cursor.execute("PRAGMA table_info(conversation_messages)")
            columns = {str(row[1]) for row in cursor.fetchall()}
            if "stream_blocks" not in columns:
                cursor.execute(
                    "ALTER TABLE conversation_messages "
                    "ADD COLUMN stream_blocks TEXT NOT NULL DEFAULT '[]'"
                )
            if "pipeline_trace" not in columns:
                cursor.execute(
                    "ALTER TABLE conversation_messages "
                    "ADD COLUMN pipeline_trace TEXT"
                )
            if "turn_summary" not in columns:
                cursor.execute(
                    "ALTER TABLE conversation_messages "
                    "ADD COLUMN turn_summary TEXT"
                )
            if "stream_schema_version" not in columns:
                cursor.execute(
                    "ALTER TABLE conversation_messages "
                    "ADD COLUMN stream_schema_version INTEGER NOT NULL DEFAULT 1"
                )
            cursor.execute("PRAGMA table_info(agents)")
            agent_columns = {str(row[1]) for row in cursor.fetchall()}
            if "use_global_model_settings" not in agent_columns:
                cursor.execute(
                    "ALTER TABLE agents "
                    "ADD COLUMN use_global_model_settings INTEGER NOT NULL DEFAULT 1"
                )
            if "avatar_type" not in agent_columns:
                cursor.execute(
                    "ALTER TABLE agents "
                    "ADD COLUMN avatar_type TEXT NOT NULL DEFAULT 'emoji'"
                )
            if "avatar_image" not in agent_columns:
                cursor.execute("ALTER TABLE agents ADD COLUMN avatar_image TEXT")
            if "avatar_shape" not in agent_columns:
                cursor.execute(
                    "ALTER TABLE agents "
                    "ADD COLUMN avatar_shape TEXT NOT NULL DEFAULT 'circle'"
                )
            if "banner_mode" not in agent_columns:
                cursor.execute(
                    "ALTER TABLE agents "
                    "ADD COLUMN banner_mode TEXT NOT NULL DEFAULT 'none'"
                )
            if "banner_image" not in agent_columns:
                cursor.execute("ALTER TABLE agents ADD COLUMN banner_image TEXT")
            if "skill_ids" not in agent_columns:
                cursor.execute(
                    "ALTER TABLE agents "
                    "ADD COLUMN skill_ids TEXT NOT NULL DEFAULT '[]'"
                )
            if "is_hidden" not in agent_columns:
                cursor.execute(
                    "ALTER TABLE agents "
                    "ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0"
                )
            # Forward migration: ensure scrapbook table exists for pre-existing DBs.
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS scrapbook ("
                "id TEXT PRIMARY KEY, "
                "title TEXT NOT NULL DEFAULT '', "
                "emoji TEXT, "
                "summary TEXT NOT NULL DEFAULT '', "
                "content TEXT NOT NULL DEFAULT '', "
                "source_url TEXT, "
                "platform TEXT NOT NULL DEFAULT 'manual', "
                "thumbnail TEXT, "
                "tags TEXT NOT NULL DEFAULT '[]', "
                "created_at TEXT NOT NULL, "
                "updated_at TEXT NOT NULL)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_scrapbook_created_at "
                "ON scrapbook(created_at DESC)"
            )
            cursor.execute("PRAGMA table_info(scrapbook)")
            scrapbook_columns = {str(row[1]) for row in cursor.fetchall()}
            if "emoji" not in scrapbook_columns:
                cursor.execute("ALTER TABLE scrapbook ADD COLUMN emoji TEXT")
            cursor.execute("PRAGMA table_info(conversations)")
            conv_columns = {str(row[1]) for row in cursor.fetchall()}
            if "scrapbook_id" not in conv_columns:
                cursor.execute("ALTER TABLE conversations ADD COLUMN scrapbook_id TEXT")
            self._conn.commit()

    def _execute(self, sql: str, params: list[Any] | tuple[Any, ...] = ()) -> sqlite3.Cursor:
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(sql, params)
            self._conn.commit()
            return cursor

    def _fetchall(self, sql: str, params: list[Any]) -> list[dict[str, Any]]:
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(sql, params)
            rows = [dict(row) for row in cursor.fetchall()]
            return rows

    def _fetchone(self, sql: str, params: list[Any]) -> dict[str, Any] | None:
        with self._lock:
            cursor = self._conn.cursor()
            cursor.execute(sql, params)
            row = cursor.fetchone()
            return dict(row) if row else None

    def execute(self, req: DbQueryRequest) -> DbQueryResponse:
        action = req.action
        if action == "select":
            return self._select(req)
        if action == "insert":
            return self._insert(req)
        if action == "update":
            return self._update(req)
        if action == "delete":
            return self._delete(req)
        if action == "upsert":
            return self._upsert(req)
        if action == "rpc":
            return self._rpc(req)
        if action == "test":
            return self._test(req)
        return DbQueryResponse(error="Unsupported action")

    def _select(self, req: DbQueryRequest) -> DbQueryResponse:
        table = req.table
        if not table:
            return DbQueryResponse(error="Missing table")
        columns = _normalize_columns(req.columns)
        select_clause = "*" if not columns else ", ".join(columns)
        where_clause, params = _build_where_clause(req.filters)
        order_clause = ""
        if req.order:
            orders = [f"{o.column} {'ASC' if o.ascending else 'DESC'}" for o in req.order]
            order_clause = " ORDER BY " + ", ".join(orders)
        limit_clause = ""
        if req.range:
            limit = max(0, req.range.to - req.range.from_ + 1)
            limit_clause = f" LIMIT {limit} OFFSET {req.range.from_}"
        elif req.limit:
            limit_clause = f" LIMIT {req.limit}"

        sql = f"SELECT {select_clause} FROM {table} {where_clause}{order_clause}{limit_clause}"
        rows = self._fetchall(sql, params)
        data = [_deserialize_row(table, row) for row in rows]
        count = None
        if req.count == "exact":
            count_sql = f"SELECT COUNT(*) as count FROM {table} {where_clause}"
            count_row = self._fetchone(count_sql, params)
            count = int(count_row["count"]) if count_row else 0
        if req.single or req.maybe_single:
            data = data[0] if data else None
        return DbQueryResponse(data=data, count=count)

    def _insert(self, req: DbQueryRequest) -> DbQueryResponse:
        table = req.table
        if not table:
            return DbQueryResponse(error="Missing table")
        values = req.values
        if values is None:
            return DbQueryResponse(error="Missing values")
        rows = values if isinstance(values, list) else [values]
        now = _utc_now_iso()
        prepared = []
        for row in rows:
            payload = dict(row)
            if table in TABLES_WITH_ID and not payload.get("id"):
                payload["id"] = str(uuid.uuid4())
            if table in TABLES_WITH_CREATED_AT or "created_at" in payload:
                payload.setdefault("created_at", now)
            if table in TABLES_WITH_UPDATED_AT or "updated_at" in payload:
                payload.setdefault("updated_at", now)
            prepared.append(payload)

        columns = sorted({key for row in prepared for key in row.keys()})
        placeholders = ", ".join(["?"] * len(columns))
        sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
        with self._lock:
            cursor = self._conn.cursor()
            for payload in prepared:
                params = [_serialize_value(table, col, payload.get(col)) for col in columns]
                cursor.execute(sql, params)
                if table == "conversation_messages":
                    conv_id = payload.get("conversation_id")
                    if conv_id:
                        cursor.execute(
                            "UPDATE conversations SET updated_at = ? WHERE id = ?",
                            [now, conv_id],
                        )
            self._conn.commit()

        single_mode = bool(req.single or req.maybe_single)
        if req.columns or single_mode:
            ids = [row.get("id") for row in prepared if row.get("id")]
            data = None
            if ids:
                filters = [DbFilter(op="in", column="id", values=ids)]
                select_req = DbQueryRequest(
                    providerId=req.provider_id,
                    action="select",
                    table=table,
                    columns=req.columns,
                    filters=filters,
                    single=single_mode,
                )
                return self._select(select_req)
            data = prepared[0] if single_mode else prepared
            return DbQueryResponse(data=data)
        return DbQueryResponse(data=prepared[0] if single_mode else prepared)

    def _update(self, req: DbQueryRequest) -> DbQueryResponse:
        table = req.table
        if not table:
            return DbQueryResponse(error="Missing table")
        payload = req.payload or {}
        if not payload:
            return DbQueryResponse(error="Missing payload")
        now = _utc_now_iso()
        if table in TABLES_WITH_UPDATED_AT and "updated_at" not in payload:
            payload["updated_at"] = now
        set_clause = ", ".join([f"{k} = ?" for k in payload.keys()])
        params = [_serialize_value(table, k, v) for k, v in payload.items()]
        where_clause, where_params = _build_where_clause(req.filters)
        sql = f"UPDATE {table} SET {set_clause} {where_clause}"
        self._execute(sql, params + where_params)

        if table == "conversation_messages":
            conv_id = payload.get("conversation_id")
            if conv_id:
                self._execute(
                    "UPDATE conversations SET updated_at = ? WHERE id = ?",
                    [now, conv_id],
                )

        if req.columns or req.single or req.maybe_single:
            select_req = DbQueryRequest(
                providerId=req.provider_id,
                action="select",
                table=table,
                columns=req.columns,
                filters=req.filters,
                single=bool(req.single or req.maybe_single),
            )
            return self._select(select_req)
        return DbQueryResponse(data=None)

    def _delete(self, req: DbQueryRequest) -> DbQueryResponse:
        table = req.table
        if not table:
            return DbQueryResponse(error="Missing table")
        pending_cleanup_all = False
        pending_cleanup_conversation_ids: list[str] = []
        if table == "conversations":
            if req.filters:
                pending_cleanup_conversation_ids = _extract_filter_values(req.filters, "id")
            else:
                pending_cleanup_all = True
        elif table == "conversation_messages":
            pending_cleanup_conversation_ids = _extract_filter_values(req.filters, "conversation_id")

        where_clause, params = _build_where_clause(req.filters)
        sql = f"DELETE FROM {table} {where_clause}"
        self._execute(sql, params)

        # Keep pending HITL runs in sync with conversation lifecycle.
        if pending_cleanup_all:
            self._execute("DELETE FROM pending_form_runs", [])
        elif pending_cleanup_conversation_ids:
            placeholders = ", ".join(["?"] * len(pending_cleanup_conversation_ids))
            self._execute(
                f"DELETE FROM pending_form_runs WHERE conversation_id IN ({placeholders})",
                pending_cleanup_conversation_ids,
            )
        return DbQueryResponse(data=None)

    def _upsert(self, req: DbQueryRequest) -> DbQueryResponse:
        table = req.table
        if not table:
            return DbQueryResponse(error="Missing table")
        values = req.values
        if values is None:
            return DbQueryResponse(error="Missing values")
        rows = values if isinstance(values, list) else [values]
        now = _utc_now_iso()
        prepared = []
        for row in rows:
            payload = dict(row)
            if table in TABLES_WITH_ID and not payload.get("id"):
                payload["id"] = str(uuid.uuid4())
            if table in TABLES_WITH_CREATED_AT:
                payload.setdefault("created_at", now)
            if table in TABLES_WITH_UPDATED_AT and "updated_at" not in payload:
                payload["updated_at"] = now
            prepared.append(payload)

        columns = sorted({key for row in prepared for key in row.keys()})
        placeholders = ", ".join(["?"] * len(columns))
        on_conflict_raw = req.on_conflict or ["id"]
        on_conflict = (
            [str(item).strip() for item in on_conflict_raw if str(item).strip()]
            if isinstance(on_conflict_raw, list)
            else [part.strip() for part in str(on_conflict_raw).split(",") if part.strip()]
        )
        update_cols = [col for col in columns if col not in on_conflict]
        update_clause = ", ".join([f"{col}=excluded.{col}" for col in update_cols])
        sql = (
            f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) "
            f"ON CONFLICT({', '.join(on_conflict)}) DO UPDATE SET {update_clause}"
        )
        with self._lock:
            cursor = self._conn.cursor()
            for payload in prepared:
                params = [_serialize_value(table, col, payload.get(col)) for col in columns]
                cursor.execute(sql, params)
            self._conn.commit()

        single_mode = bool(req.single or req.maybe_single)
        if req.columns or single_mode:
            ids = [row.get("id") for row in prepared if row.get("id")]
            filters = [DbFilter(op="in", column="id", values=ids)] if ids else None
            select_req = DbQueryRequest(
                providerId=req.provider_id,
                action="select",
                table=table,
                columns=req.columns,
                filters=filters,
                single=single_mode,
            )
            return self._select(select_req)
        return DbQueryResponse(data=prepared[0] if single_mode else prepared)

    def _rpc(self, req: DbQueryRequest) -> DbQueryResponse:
        if not req.rpc:
            return DbQueryResponse(error="Missing rpc")
        return DbQueryResponse(error=f"Unsupported rpc: {req.rpc.name}")

    def _test(self, req: DbQueryRequest) -> DbQueryResponse:
        tables = [
            "spaces",
            "agents",
            "space_agents",
            "conversations",
            "conversation_messages",
            "space_documents",
            "conversation_documents",
            "user_settings",
            "memory_domains",
            "memory_summaries",
            "user_tools",
            "home_notes",
            "home_shortcuts",
        ]
        results = {}
        for table in tables:
            try:
                self._fetchone(f"SELECT 1 FROM {table} LIMIT 1", [])
                results[table] = True
            except Exception:
                results[table] = False
        all_ok = all(results.values())
        return DbQueryResponse(
            data={
                "success": all_ok,
                "connection": True,
                "tables": results,
                "message": "Connection successful; required tables are present."
                if all_ok
                else "Connection OK, but missing tables.",
            }
        )


@dataclass
class SQLAlchemyAdapter:
    config: ProviderConfig

    def __post_init__(self) -> None:
        if not self.config.connection_url:
            raise ValueError(f"{self.config.type} provider missing connection url")
        self._engine = create_engine(self.config.connection_url, future=True, pool_pre_ping=True)
        self._metadata = MetaData()
        self._table_cache: dict[str, Any] = {}
        self._lock = threading.Lock()

    def _get_table(self, table_name: str):
        with self._lock:
            if table_name in self._table_cache:
                return self._table_cache[table_name]
            table_obj = self._metadata.tables.get(table_name)
            if table_obj is None:
                self._metadata.reflect(bind=self._engine, only=[table_name], extend_existing=True)
                table_obj = self._metadata.tables.get(table_name)
            if table_obj is None:
                raise ValueError(f"Unknown table: {table_name}")
            self._table_cache[table_name] = table_obj
            return table_obj

    def _apply_filters(self, stmt, table_obj, filters: list[DbFilter] | None):
        expressions = [_build_sa_expression(table_obj, filt) for filt in (filters or [])]
        expressions = [expr for expr in expressions if expr is not None]
        if expressions:
            stmt = stmt.where(and_(*expressions))
        return stmt

    def execute(self, req: DbQueryRequest) -> DbQueryResponse:
        try:
            if req.action == "test":
                return self._test()
            if req.action == "rpc":
                return DbQueryResponse(error=f"RPC is not supported for provider type '{self.config.type}'")
            if not req.table:
                return DbQueryResponse(error="Missing table")
            if req.action == "select":
                return self._select(req)
            if req.action == "insert":
                return self._insert(req)
            if req.action == "update":
                return self._update(req)
            if req.action == "delete":
                return self._delete(req)
            if req.action == "upsert":
                return self._upsert(req)
            return DbQueryResponse(error="Unsupported action")
        except Exception as exc:
            logger.error("%s adapter error: %s", self.config.type, exc)
            return DbQueryResponse(error=str(exc))

    def _select(self, req: DbQueryRequest) -> DbQueryResponse:
        table_obj = self._get_table(req.table)
        columns = _normalize_columns(req.columns)
        selected_columns = [table_obj.c[col] for col in columns if col in table_obj.c] if columns else [table_obj]
        stmt = select(*selected_columns)
        stmt = self._apply_filters(stmt, table_obj, req.filters)
        if req.order:
            for order in req.order:
                if order.column in table_obj.c:
                    column = table_obj.c[order.column]
                    stmt = stmt.order_by(column.asc() if order.ascending else column.desc())
        if req.range:
            stmt = stmt.offset(req.range.from_).limit(max(0, req.range.to - req.range.from_ + 1))
        elif req.limit:
            stmt = stmt.limit(req.limit)
        with self._engine.begin() as conn:
            rows = [dict(row._mapping) for row in conn.execute(stmt).fetchall()]
            count = None
            if req.count == "exact":
                count_stmt = select(func.count()).select_from(table_obj)
                count_stmt = self._apply_filters(count_stmt, table_obj, req.filters)
                count = int(conn.execute(count_stmt).scalar_one() or 0)
        data: Any = _deserialize_rows(req.table, rows)
        if req.single or req.maybe_single:
            data = data[0] if data else None
        return DbQueryResponse(data=data, count=count)

    def _prepare_rows(self, table: str, values: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
        rows = values if isinstance(values, list) else [values]
        now = _utc_now_iso()
        prepared = []
        for row in rows:
            payload = dict(row)
            if table in TABLES_WITH_ID and not payload.get("id"):
                payload["id"] = str(uuid.uuid4())
            if table in TABLES_WITH_CREATED_AT or "created_at" in payload:
                payload.setdefault("created_at", now)
            if table in TABLES_WITH_UPDATED_AT or "updated_at" in payload:
                payload.setdefault("updated_at", now)
            prepared.append(_prepare_payload(table, payload))
        return prepared

    def _insert(self, req: DbQueryRequest) -> DbQueryResponse:
        values = req.values if req.values is not None else req.payload
        if values is None:
            return DbQueryResponse(error="Missing values")
        table_obj = self._get_table(req.table)
        prepared = self._prepare_rows(req.table, values)
        with self._engine.begin() as conn:
            conn.execute(table_obj.insert(), prepared)
        data: Any = _deserialize_rows(req.table, prepared)
        if req.single or req.maybe_single:
            data = data[0] if data else None
        return DbQueryResponse(data=data)

    def _update(self, req: DbQueryRequest) -> DbQueryResponse:
        payload = dict(req.payload or {})
        if not payload:
            return DbQueryResponse(error="Missing payload")
        if req.table in TABLES_WITH_UPDATED_AT and "updated_at" not in payload:
            payload["updated_at"] = _utc_now_iso()
        table_obj = self._get_table(req.table)
        stmt = update(table_obj).values(**_prepare_payload(req.table, payload))
        stmt = self._apply_filters(stmt, table_obj, req.filters)
        with self._engine.begin() as conn:
            conn.execute(stmt)
        if req.columns or req.single or req.maybe_single:
            return self._select(
                DbQueryRequest(
                    providerId=req.provider_id,
                    action="select",
                    table=req.table,
                    columns=req.columns,
                    filters=req.filters,
                    single=bool(req.single or req.maybe_single),
                )
            )
        return DbQueryResponse(data=None)

    def _delete(self, req: DbQueryRequest) -> DbQueryResponse:
        table_obj = self._get_table(req.table)
        stmt = delete(table_obj)
        stmt = self._apply_filters(stmt, table_obj, req.filters)
        with self._engine.begin() as conn:
            conn.execute(stmt)
        return DbQueryResponse(data=None)

    def _upsert(self, req: DbQueryRequest) -> DbQueryResponse:
        values = req.values if req.values is not None else req.payload
        if values is None:
            return DbQueryResponse(error="Missing values")
        table_obj = self._get_table(req.table)
        prepared = self._prepare_rows(req.table, values)
        on_conflict_raw = req.on_conflict or ["id"]
        on_conflict = (
            [str(item).strip() for item in on_conflict_raw if str(item).strip()]
            if isinstance(on_conflict_raw, list)
            else [part.strip() for part in str(on_conflict_raw).split(",") if part.strip()]
        )
        update_cols = [col.name for col in table_obj.columns if col.name not in on_conflict]

        dialect = self._engine.dialect.name
        if dialect == "postgresql":
            stmt = postgres_insert(table_obj).values(prepared)
            stmt = stmt.on_conflict_do_update(
                index_elements=on_conflict,
                set_={col: getattr(stmt.excluded, col) for col in update_cols},
            )
        elif dialect in {"mysql", "mariadb"}:
            stmt = mysql_insert(table_obj).values(prepared)
            stmt = stmt.on_duplicate_key_update(
                **{col: getattr(stmt.inserted, col) for col in update_cols}
            )
        else:
            return DbQueryResponse(
                error=f"Upsert is not supported for SQL dialect '{dialect}' on provider type '{self.config.type}'"
            )

        with self._engine.begin() as conn:
            conn.execute(stmt)
        data: Any = _deserialize_rows(req.table, prepared)
        if req.single or req.maybe_single:
            data = data[0] if data else None
        return DbQueryResponse(data=data)

    def _test(self) -> DbQueryResponse:
        inspector = inspect(self._engine)
        table_names = set(inspector.get_table_names())
        tables = [
            "spaces",
            "agents",
            "space_agents",
            "conversations",
            "conversation_messages",
            "space_documents",
            "conversation_documents",
            "user_settings",
            "memory_domains",
            "memory_summaries",
            "user_tools",
            "home_notes",
            "home_shortcuts",
            "pending_form_runs",
            "scrapbook",
        ]
        results = {table: table in table_names for table in tables}
        all_ok = all(results.values())
        return DbQueryResponse(
            data={
                "success": all_ok,
                "connection": True,
                "tables": results,
                "message": "Connection successful; required tables are present."
                if all_ok
                else "Connection OK, but missing tables.",
            }
        )


@dataclass
class SupabaseAdapter:
    config: ProviderConfig

    def __post_init__(self) -> None:
        from supabase import create_client

        if not self.config.supabase_url or not self.config.supabase_anon_key:
            raise ValueError("Supabase provider missing url or anon key")
        self._client = create_client(self.config.supabase_url, self.config.supabase_anon_key)

    def execute(self, req: DbQueryRequest) -> DbQueryResponse:
        try:
            if req.action == "test":
                return self._test()
            if req.action == "rpc":
                return self._rpc(req)
            if not req.table:
                return DbQueryResponse(error="Missing table")
            if req.action == "select":
                return self._select(req)
            if req.action == "insert":
                return self._insert(req)
            if req.action == "update":
                return self._update(req)
            if req.action == "delete":
                return self._delete(req)
            if req.action == "upsert":
                return self._upsert(req)
            return DbQueryResponse(error="Unsupported action")
        except Exception as exc:
            logger.error("Supabase adapter error: %s", exc)
            return DbQueryResponse(error=str(exc))

    def _table(self, table: str):
        if hasattr(self._client, "table"):
            return self._client.table(table)
        if hasattr(self._client, "from_"):
            return self._client.from_(table)
        raise AttributeError("Supabase client has no table/from_ method")

    def _apply_filters(self, query, filters: list[DbFilter] | None):
        if not filters:
            return query
        for filt in filters:
            if filt.op == "or" and filt.filters:
                or_parts = []
                for inner in filt.filters:
                    if inner.op == "is_null":
                        or_parts.append(f"{inner.column}.is.null")
                    elif inner.op == "not_in":
                        values = ",".join([str(v) for v in (inner.values or [])])
                        or_parts.append(f"{inner.column}.not.in.({values})")
                    elif inner.op == "eq":
                        or_parts.append(f"{inner.column}.eq.{inner.value}")
                if hasattr(query, "or_") and or_parts:
                    query = query.or_(",".join(or_parts))
                continue
            col = filt.column
            if not col:
                continue
            if filt.op == "eq":
                query = query.eq(col, filt.value)
            elif filt.op == "gt":
                query = query.gt(col, filt.value)
            elif filt.op == "lt":
                query = query.lt(col, filt.value)
            elif filt.op == "ilike":
                query = query.ilike(col, f"%{filt.value}%")
            elif filt.op == "in":
                query = query.in_(col, filt.values or [])
            elif filt.op == "not_in":
                if hasattr(query, "not_"):
                    query = query.not_.in_(col, filt.values or [])
            elif filt.op == "is_null":
                if hasattr(query, "is_"):
                    query = query.is_(col, "null")
        return query

    def _select(self, req: DbQueryRequest) -> DbQueryResponse:
        query = self._table(req.table)
        columns = req.columns or "*"
        if isinstance(columns, list):
            columns = ",".join([str(col).strip() for col in columns if str(col).strip()]) or "*"
        if req.count:
            query = query.select(columns, count=req.count)
        else:
            query = query.select(columns)
        query = self._apply_filters(query, req.filters)
        if req.order:
            for order in req.order:
                query = query.order(order.column, desc=not order.ascending)
        if req.range:
            query = query.range(req.range.from_, req.range.to)
        elif req.limit:
            query = query.limit(req.limit)
        if req.maybe_single:
            if hasattr(query, "maybe_single"):
                query = query.maybe_single()
            elif hasattr(query, "maybeSingle"):
                query = query.maybeSingle()
            else:
                # Keep best-effort maybe-single semantics without forcing object coercion.
                if not req.limit:
                    query = query.limit(1)
        elif req.single and hasattr(query, "single"):
            query = query.single()
        try:
            result = query.execute()
        except Exception as exc:
            if req.maybe_single:
                error_text = str(exc)
                if (
                    "PGRST116" in error_text
                    or "Cannot coerce the result to a single JSON object" in error_text
                    or "The result contains 0 rows" in error_text
                ):
                    return DbQueryResponse(data=None, count=None)
            raise
        data = getattr(result, "data", None)
        count = getattr(result, "count", None)
        error = getattr(result, "error", None)
        if req.maybe_single and isinstance(data, list):
            data = data[0] if data else None
        if error and req.maybe_single:
            error_text = str(error)
            if (
                "PGRST116" in error_text
                or "Cannot coerce the result to a single JSON object" in error_text
                or "The result contains 0 rows" in error_text
            ):
                return DbQueryResponse(data=None, count=count)
        if error:
            return DbQueryResponse(error=str(error))
        return DbQueryResponse(data=data, count=count)

    def _insert(self, req: DbQueryRequest) -> DbQueryResponse:
        query = self._table(req.table)
        values = req.values if req.values is not None else req.payload
        if values is None:
            return DbQueryResponse(error="Missing values")
        # Use upsert with ignoreDuplicates=False to get data back, or just insert
        # Supabase insert returns 204 by default; we handle this gracefully
        try:
            result = query.insert(values).execute()
        except Exception as exc:
            # 204 No Content is not an error — insert succeeded but no data returned
            if "204" in str(exc) or "Missing response" in str(exc):
                return DbQueryResponse(data=None)
            raise
        error = getattr(result, "error", None)
        if error:
            return DbQueryResponse(error=str(error))
        data = getattr(result, "data", None)
        if (req.single or req.maybe_single) and isinstance(data, list):
            data = data[0] if data else None
        return DbQueryResponse(data=data)


    def _update(self, req: DbQueryRequest) -> DbQueryResponse:
        query = self._table(req.table)
        payload = req.payload or {}
        query = query.update(payload)
        query = self._apply_filters(query, req.filters)
        # Supabase update returns 204 by default; handle gracefully
        try:
            result = query.execute()
        except Exception as exc:
            if "204" in str(exc) or "Missing response" in str(exc):
                return DbQueryResponse(data=None)
            raise
        error = getattr(result, "error", None)
        if error:
            return DbQueryResponse(error=str(error))
        data = getattr(result, "data", None)
        if (req.single or req.maybe_single) and isinstance(data, list):
            data = data[0] if data else None
        return DbQueryResponse(data=data)


    def _delete(self, req: DbQueryRequest) -> DbQueryResponse:
        pending_cleanup_all = False
        pending_cleanup_conversation_ids: list[str] = []
        if req.table == "conversations":
            if req.filters:
                pending_cleanup_conversation_ids = _extract_filter_values(req.filters, "id")
            else:
                pending_cleanup_all = True
        elif req.table == "conversation_messages":
            pending_cleanup_conversation_ids = _extract_filter_values(req.filters, "conversation_id")

        query = self._table(req.table)
        query = query.delete()
        query = self._apply_filters(query, req.filters)
        result = query.execute()
        error = getattr(result, "error", None)
        if error:
            return DbQueryResponse(error=str(error))

        # Keep pending HITL runs in sync with conversation lifecycle.
        if pending_cleanup_all:
            self._table("pending_form_runs").delete().execute()
        elif pending_cleanup_conversation_ids:
            self._table("pending_form_runs").delete().in_(
                "conversation_id", pending_cleanup_conversation_ids
            ).execute()
        return DbQueryResponse(data=getattr(result, "data", None))

    def _upsert(self, req: DbQueryRequest) -> DbQueryResponse:
        query = self._table(req.table)
        values = req.values if req.values is not None else req.payload
        if values is None:
            return DbQueryResponse(error="Missing values")
        on_conflict = req.on_conflict
        if isinstance(on_conflict, list):
            on_conflict = ",".join([str(item).strip() for item in on_conflict if str(item).strip()])
        query = query.upsert(values, on_conflict=on_conflict)
        result = query.execute()
        error = getattr(result, "error", None)
        if error:
            return DbQueryResponse(error=str(error))
        data = getattr(result, "data", None)
        if (req.single or req.maybe_single) and isinstance(data, list):
            data = data[0] if data else None
        return DbQueryResponse(data=data)

    def _rpc(self, req: DbQueryRequest) -> DbQueryResponse:
        if not req.rpc:
            return DbQueryResponse(error="Missing rpc")
        result = self._client.rpc(req.rpc.name, req.rpc.params or {}).execute()
        error = getattr(result, "error", None)
        if error:
            return DbQueryResponse(error=str(error))
        return DbQueryResponse(data=getattr(result, "data", None))

    def _test(self) -> DbQueryResponse:
        table_fields = {
            "spaces": "id",
            "agents": "id",
            "space_agents": "space_id",
            "conversations": "id",
            "conversation_messages": "id",
            "space_documents": "id",
            "conversation_documents": "conversation_id",
            "user_settings": "key",
            "memory_domains": "id",
            "memory_summaries": "id",
            "user_tools": "id",
            "home_notes": "id",
            "home_shortcuts": "id",
        }
        results = {}
        for table, field in table_fields.items():
            try:
                query = self._table(table).select(field).limit(1)
                result = query.execute()
                results[table] = getattr(result, "error", None) is None
            except Exception:
                results[table] = False
        all_ok = all(results.values())
        return DbQueryResponse(
            data={
                "success": all_ok,
                "connection": True,
                "tables": results,
                "message": "Connection successful; required tables are present."
                if all_ok
                else "Connection OK, but missing tables.",
            }
        )


def build_adapter(config: ProviderConfig):
    if config.type == "sqlite":
        return SQLiteAdapter(config)
    if config.type == "supabase":
        return SupabaseAdapter(config)
    if config.type in {"postgres", "mysql", "mariadb"}:
        return SQLAlchemyAdapter(config)
    raise ValueError("Unsupported provider type")

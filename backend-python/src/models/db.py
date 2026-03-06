"""
Database proxy request/response models.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class DbOrder(BaseModel):
    column: str
    ascending: bool = True


class DbRange(BaseModel):
    from_: int = Field(alias="from")
    to: int


class DbFilter(BaseModel):
    op: Literal[
        "eq",
        "gt",
        "lt",
        "ilike",
        "in",
        "not_in",
        "is_null",
        "or",
    ]
    column: str | None = None
    value: Any | None = None
    values: list[Any] | None = None
    filters: list[DbFilter] | None = None


class DbRpc(BaseModel):
    name: str
    params: dict[str, Any] | None = None


class DbQueryRequest(BaseModel):
    provider_id: str = Field(default="default", alias="providerId")
    action: Literal[
        "select",
        "insert",
        "update",
        "delete",
        "upsert",
        "rpc",
        "test",
    ]
    table: str | None = None
    columns: str | list[str] | None = None
    filters: list[DbFilter] | None = None
    order: list[DbOrder] | None = None
    limit: int | None = None
    range: DbRange | None = None
    count: Literal["exact"] | None = None
    single: bool | None = None
    maybe_single: bool | None = Field(default=None, alias="maybeSingle")
    values: list[dict[str, Any]] | dict[str, Any] | None = None
    payload: dict[str, Any] | None = None
    on_conflict: list[str] | str | None = Field(default=None, alias="onConflict")
    rpc: DbRpc | None = None


class DbQueryResponse(BaseModel):
    data: Any | None = None
    error: str | None = None
    count: int | None = None


class DbProviderUpsertRequest(BaseModel):
    id: str = "default"
    type: Literal["supabase", "sqlite", "postgres", "pgsql", "mysql", "mariadb"]
    label: str | None = None
    access_key: str | None = Field(default=None, alias="accessKey")
    url: str | None = None
    anon_key: str | None = Field(default=None, alias="anonKey")
    path: str | None = None

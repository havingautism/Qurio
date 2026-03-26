"""
Schema normalization for excel_generator tool payloads.
"""

from __future__ import annotations

from typing import Any

EXCEL_DEFAULT_TITLE = "Generated Workbook"
EXCEL_MAX_SHEETS = 12
EXCEL_MAX_ROWS_PER_SHEET = 5000
EXCEL_MAX_COLUMNS_PER_SHEET = 50
EXCEL_PREVIEW_ROW_LIMIT = 8
EXCEL_PREVIEW_COLUMN_LIMIT = 8


def build_excel_error(code: str, message: str) -> dict[str, Any]:
    return {
        "type": "excel_error",
        "code": str(code or "invalid_payload"),
        "message": str(message or "Invalid Excel payload."),
    }


def _coerce_cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _normalize_columns(raw_columns: Any, rows: list[Any]) -> list[str]:
    if isinstance(raw_columns, list):
        columns = [str(item or "").strip() for item in raw_columns]
        return [item or f"Column {index + 1}" for index, item in enumerate(columns)]

    if rows and isinstance(rows[0], dict):
        seen: list[str] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            for key in row.keys():
                label = str(key or "").strip()
                if label and label not in seen:
                    seen.append(label)
        return seen[:EXCEL_MAX_COLUMNS_PER_SHEET]

    if rows and isinstance(rows[0], list):
        width = min(len(rows[0]), EXCEL_MAX_COLUMNS_PER_SHEET)
        return [f"Column {index + 1}" for index in range(width)]

    return []


def _normalize_rows(raw_rows: Any, columns: list[str]) -> list[list[Any]]:
    if not isinstance(raw_rows, list):
        return []

    normalized: list[list[Any]] = []
    for row in raw_rows[:EXCEL_MAX_ROWS_PER_SHEET]:
        if isinstance(row, dict):
            normalized.append([_coerce_cell(row.get(column, "")) for column in columns])
        elif isinstance(row, list):
            values = [_coerce_cell(item) for item in row[: len(columns) or EXCEL_MAX_COLUMNS_PER_SHEET]]
            if columns and len(values) < len(columns):
                values.extend([""] * (len(columns) - len(values)))
            normalized.append(values)
        else:
            normalized.append([_coerce_cell(row)])
    return normalized


def _normalize_sheet(raw_sheet: Any, index: int) -> dict[str, Any] | None:
    if not isinstance(raw_sheet, dict):
        return None

    raw_rows = raw_sheet.get("rows")
    if not isinstance(raw_rows, list):
        raw_rows = raw_sheet.get("data")
    rows_list = raw_rows if isinstance(raw_rows, list) else []
    columns = _normalize_columns(raw_sheet.get("columns"), rows_list)
    if len(columns) > EXCEL_MAX_COLUMNS_PER_SHEET:
        columns = columns[:EXCEL_MAX_COLUMNS_PER_SHEET]
    rows = _normalize_rows(rows_list, columns)

    if not columns and rows:
        columns = [f"Column {i + 1}" for i in range(min(len(rows[0]), EXCEL_MAX_COLUMNS_PER_SHEET))]
        rows = [row[: len(columns)] for row in rows]

    return {
        "name": str(raw_sheet.get("name") or f"Sheet {index + 1}").strip()[:31] or f"Sheet {index + 1}",
        "columns": columns,
        "rows": rows,
    }


def build_excel_payload(args: dict[str, Any] | None) -> dict[str, Any]:
    payload = args if isinstance(args, dict) else {}
    title = str(payload.get("title") or EXCEL_DEFAULT_TITLE).strip() or EXCEL_DEFAULT_TITLE

    raw_sheets = payload.get("sheets")
    if not isinstance(raw_sheets, list) or not raw_sheets:
        fallback_sheet = {
            "name": payload.get("sheet_name") or "Sheet 1",
            "columns": payload.get("columns") or [],
            "rows": payload.get("rows") if isinstance(payload.get("rows"), list) else (payload.get("data") or []),
        }
        raw_sheets = [fallback_sheet]

    sheets = []
    for index, raw_sheet in enumerate(raw_sheets[:EXCEL_MAX_SHEETS]):
        normalized = _normalize_sheet(raw_sheet, index)
        if not normalized:
            continue
        if not normalized["columns"] and not normalized["rows"]:
            continue
        sheets.append(normalized)

    if not sheets:
        return build_excel_error("empty_workbook", "No usable sheet data provided.")

    preview_sheets = []
    for sheet in sheets:
        preview_columns = sheet["columns"][:EXCEL_PREVIEW_COLUMN_LIMIT]
        preview_rows = [row[: len(preview_columns)] for row in sheet["rows"][:EXCEL_PREVIEW_ROW_LIMIT]]
        preview_sheets.append(
            {
                "name": sheet["name"],
                "columns": preview_columns,
                "rows": preview_rows,
                "total_rows": len(sheet["rows"]),
                "total_columns": len(sheet["columns"]),
            }
        )

    return {
        "type": "excel_request",
        "title": title,
        "sheets": sheets,
        "preview": {"sheets": preview_sheets},
    }

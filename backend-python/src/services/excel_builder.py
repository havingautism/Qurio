"""
Build .xlsx files from normalized payloads.
"""

from __future__ import annotations

from typing import Any

from .excel_schema import build_excel_error


def build_excel_file(request_payload: dict[str, Any], output_path: str) -> dict[str, Any]:
    try:
        from openpyxl import Workbook
    except Exception as exc:
        return build_excel_error("missing_dependency", f"openpyxl unavailable: {exc}")

    sheets = request_payload.get("sheets")
    if not isinstance(sheets, list) or not sheets:
        return build_excel_error("empty_workbook", "No sheet data provided.")

    try:
        workbook = Workbook()
        first = True
        for sheet_payload in sheets:
            name = str(sheet_payload.get("name") or "Sheet").strip()[:31] or "Sheet"
            if first:
                worksheet = workbook.active
                worksheet.title = name
                first = False
            else:
                worksheet = workbook.create_sheet(title=name)

            columns = sheet_payload.get("columns") if isinstance(sheet_payload.get("columns"), list) else []
            rows = sheet_payload.get("rows") if isinstance(sheet_payload.get("rows"), list) else []

            if columns:
                worksheet.append(columns)
            for row in rows:
                worksheet.append(row if isinstance(row, list) else [row])

        workbook.save(output_path)
        return {
            "type": "excel_render_result",
            "sheet_count": len(sheets),
            "preview": request_payload.get("preview") or {"sheets": []},
        }
    except Exception as exc:
        return build_excel_error("build_failed", f"Unable to build Excel file: {exc}")

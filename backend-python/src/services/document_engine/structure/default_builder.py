from __future__ import annotations

from ..contracts import ParsedDocument, StructuredDocument, StructuredNode
from .base import StructureBuilderBase
from .heading_rules import parse_heading


class DefaultStructureBuilder(StructureBuilderBase):
    def build(self, parsed_document: ParsedDocument) -> StructuredDocument:
        lines = [line.rstrip() for line in str(parsed_document.text or "").splitlines()]
        nodes: list[StructuredNode] = []
        current_title = parsed_document.title or "Document"
        current_lines: list[str] = []
        current_level = 1
        node_index = 1
        line_start = 1
        heading_stack: list[tuple[int, str]] = []
        edges: list[tuple[str, str]] = []
        root_node_ids: list[str] = []

        def flush(end_line: int) -> None:
            nonlocal node_index, current_lines, line_start
            text = "\n".join(line for line in current_lines if line.strip()).strip()
            if not text:
                current_lines = []
                line_start = end_line + 1
                return
            ancestors = [title for _, title in heading_stack]
            node_id = f"n{node_index}"
            nodes.append(
                StructuredNode(
                    node_id=node_id,
                    title=current_title,
                    text=text,
                    summary=text[:240],
                    title_path=tuple([*ancestors, current_title]),
                    line_start=line_start,
                    line_end=end_line,
                    metadata={"depth": len(ancestors) + 1, "heading_level": current_level},
                )
            )
            if not ancestors:
                root_node_ids.append(node_id)
            node_index += 1
            current_lines = []
            line_start = end_line + 1

        for index, line in enumerate(lines, start=1):
            parsed_heading = parse_heading(line)
            if parsed_heading:
                flush(index - 1)
                level, title = parsed_heading
                current_level = level
                while heading_stack and heading_stack[-1][0] >= level:
                    heading_stack.pop()
                heading_stack.append((level, title))
                line_start = index + 1
                current_title = title or current_title
                continue
            current_lines.append(line)

        flush(len(lines))
        if not nodes and parsed_document.text.strip():
            nodes.append(
                StructuredNode(
                    node_id="n1",
                    title=current_title,
                    text=parsed_document.text.strip(),
                    summary=parsed_document.text.strip()[:240],
                    title_path=(current_title,),
                    line_start=1,
                    line_end=max(1, len(lines)),
                    metadata={"depth": 1, "heading_level": 1},
                )
            )
            root_node_ids = ["n1"]

        return StructuredDocument(
            document_id=parsed_document.document_id,
            title=parsed_document.title,
            nodes=nodes,
            edges=edges,
            root_node_ids=root_node_ids or [node.node_id for node in nodes],
        )

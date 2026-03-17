from __future__ import annotations

import base64
import inspect
import logging
import re
import shutil
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium
from pypdf import PdfReader

from src.providers import ExecutionContext, get_provider_adapter

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DocumentPaths:
    root: Path
    original_dir: Path
    original_file: Path
    treesearch_dir: Path
    index_db: Path


class TreeSearchDocumentService:
    @staticmethod
    def _resolve_vision_profile(*, provider: str, model_name: str) -> dict[str, str | bool]:
        provider_key = str(provider or "").strip().lower()
        model_key = str(model_name or "").strip().lower()

        generic_markdown_prompt = (
            "Extract all readable text from this document page and return markdown only. "
            "Do not add explanations."
        )
        generic_plain_prompt = (
            "Extract all readable text from this image faithfully. "
            "Return only the recognized text."
        )

        if provider_key == "siliconflow":
            if "deepseek-ocr" in model_key:
                return {
                    "family": "deepseek_ocr",
                    "detail": "high",
                    "prompt": "<image>\n<|grounding|>OCR this image.",
                    "use_system_prompt": False,
                }
            if "qwen3-omni" in model_key:
                return {
                    "family": "qwen3_omni",
                    "detail": "high",
                    "prompt": generic_markdown_prompt,
                    "use_system_prompt": False,
                }
            if "qwen3-vl" in model_key:
                return {
                    "family": "qwen3_vl",
                    "detail": "high",
                    "prompt": generic_markdown_prompt,
                    "use_system_prompt": False,
                }
            if "glm" in model_key and "4v" in model_key:
                return {
                    "family": "glm_vision",
                    "detail": "high",
                    "prompt": generic_markdown_prompt,
                    "use_system_prompt": False,
                }
            if "qwen2-vl" in model_key or "qwen2.5-vl" in model_key:
                return {
                    "family": "qwen2_vl",
                    "detail": "high",
                    "prompt": generic_markdown_prompt,
                    "use_system_prompt": False,
                }
            if "deepseek-vl2" in model_key or "deepseekvl2" in model_key:
                return {
                    "family": "deepseek_vl2",
                    "detail": "high",
                    "prompt": generic_plain_prompt,
                    "use_system_prompt": False,
                }
            if "step3" in model_key:
                return {
                    "family": "step3",
                    "detail": "high",
                    "prompt": generic_markdown_prompt,
                    "use_system_prompt": False,
                }

        return {
            "family": "generic_vision",
            "detail": "high",
            "prompt": generic_plain_prompt,
            "use_system_prompt": True,
        }

    def __init__(
        self,
        storage_root: str | Path,
        treesearch_cls: type | None = None,
        load_documents_fn: Callable[[str], list[Any]] | None = None,
        search_fn: Callable[..., Any] | None = None,
        text_to_tree_fn: Callable[..., Any] | None = None,
        fts_index_cls: type | None = None,
        ocr_parse_fn: Callable[..., Awaitable[str]] | None = None,
    ):
        self.storage_root = Path(storage_root)
        self._treesearch_cls = treesearch_cls
        self._load_documents_fn = load_documents_fn
        self._search_fn = search_fn
        self._text_to_tree_fn = text_to_tree_fn
        self._fts_index_cls = fts_index_cls
        self._ocr_parse_fn = ocr_parse_fn

    def get_document_paths(self, *, space_id: str, document_id: str, filename: str) -> DocumentPaths:
        root = self.storage_root / "spaces" / str(space_id) / "documents" / str(document_id)
        original_dir = root / "original"
        treesearch_dir = root / "treesearch"
        return DocumentPaths(
            root=root,
            original_dir=original_dir,
            original_file=original_dir / Path(filename).name,
            treesearch_dir=treesearch_dir,
            index_db=treesearch_dir / "index.db",
        )

    def _get_treesearch_cls(self):
        if self._treesearch_cls is not None:
            return self._treesearch_cls
        try:
            from treesearch import TreeSearch
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._treesearch_cls = TreeSearch
        return self._treesearch_cls

    def _get_load_documents(self):
        if self._load_documents_fn is not None:
            return self._load_documents_fn
        try:
            from treesearch import load_documents
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._load_documents_fn = load_documents
        return self._load_documents_fn

    def _get_search_fn(self):
        if self._search_fn is not None:
            return self._search_fn
        try:
            from treesearch import search
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._search_fn = search
        return self._search_fn

    def _get_text_to_tree_fn(self):
        if self._text_to_tree_fn is not None:
            return self._text_to_tree_fn
        try:
            from treesearch import text_to_tree
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._text_to_tree_fn = text_to_tree
        return self._text_to_tree_fn

    def _get_fts_index_cls(self):
        if self._fts_index_cls is not None:
            return self._fts_index_cls
        try:
            from treesearch import FTS5Index
        except ImportError as exc:
            raise RuntimeError("TreeSearch dependency is not installed") from exc
        self._fts_index_cls = FTS5Index
        return self._fts_index_cls

    @staticmethod
    def _extract_pdf_text(raw_bytes: bytes) -> str:
        reader = PdfReader(BytesIO(raw_bytes))
        parts: list[str] = []
        for page in reader.pages:
            text = (page.extract_text() or "").strip()
            if text:
                parts.append(text)
        return "\n\n".join(parts).strip()

    @staticmethod
    def _extract_content_text(content: Any) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    if item.strip():
                        parts.append(item.strip())
                    continue
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        text = str(item.get("text") or "").strip()
                        if text:
                            parts.append(text)
                        continue
                    text = str(item.get("text") or "").strip()
                    if text:
                        parts.append(text)
            return "\n".join(parts).strip()
        return str(content or "").strip()

    @staticmethod
    def _sanitize_ocr_text(text: str) -> str:
        cleaned = str(text or "")
        cleaned = re.sub(r"<\|ref\|>.*?</ref>", "", cleaned, flags=re.DOTALL)
        cleaned = re.sub(r"<\|det\|>.*?</det>", "", cleaned, flags=re.DOTALL)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        return cleaned.strip()

    @staticmethod
    def _render_pdf_pages_as_jpeg_base64(raw_bytes: bytes, max_pages: int = 12) -> list[str]:
        document = pdfium.PdfDocument(raw_bytes)
        page_count = min(len(document), max_pages)
        images: list[str] = []
        try:
            for page_idx in range(page_count):
                page = document[page_idx]
                try:
                    bitmap = page.render(scale=2.0)
                    image = bitmap.to_pil()
                    buffer = BytesIO()
                    image.save(buffer, format="JPEG", quality=85, optimize=True)
                    images.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
                finally:
                    page.close()
        finally:
            document.close()
        return images

    @staticmethod
    def _count_pdf_pages(raw_bytes: bytes, max_pages: int = 12) -> int:
        try:
            document = pdfium.PdfDocument(raw_bytes)
        except Exception:
            return 0
        try:
            return min(len(document), max_pages)
        finally:
            document.close()

    async def _index_via_treesearch(self, *, paths: DocumentPaths):
        tree_search_cls = self._get_treesearch_cls()
        tree_search = tree_search_cls(str(paths.original_file), db_path=str(paths.index_db))
        if hasattr(tree_search, "aindex"):
            await tree_search.aindex(
                str(paths.original_file),
                force=True,
                if_add_node_text=True,
                if_add_doc_description=True,
            )
            return
        if hasattr(tree_search, "index"):
            result = tree_search.index(
                str(paths.original_file),
                force=True,
                if_add_node_text=True,
                if_add_doc_description=True,
            )
            if inspect.isawaitable(result):
                await result
            return
        raise RuntimeError("TreeSearch instance does not provide index/aindex")

    def _load_document_summary(self, *, paths: DocumentPaths) -> dict[str, Any] | None:
        if not paths.index_db.exists():
            return None
        try:
            load_documents = self._get_load_documents()
            documents = load_documents(str(paths.index_db))
            if documents:
                return self._serialize_document_summary(documents[0])
        except RuntimeError:
            return None
        return None

    async def _call_ocr_model_for_pdf(
        self,
        *,
        raw_bytes: bytes,
        ocr_provider: str,
        ocr_model: str,
        ocr_api_key: str,
        ocr_base_url: str,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> str:
        if self._ocr_parse_fn is not None:
            return await self._ocr_parse_fn(
                raw_bytes=raw_bytes,
                ocr_provider=ocr_provider,
                ocr_model=ocr_model,
                ocr_api_key=ocr_api_key,
                ocr_base_url=ocr_base_url,
            )

        images = self._render_pdf_pages_as_jpeg_base64(raw_bytes)
        if not images:
            return ""
        adapter = get_provider_adapter(ocr_provider or "openai_compatibility")
        vision_profile = self._resolve_vision_profile(provider=ocr_provider, model_name=ocr_model)
        logger.info(
            "OCR parse start provider=%s model=%s mode=image_pages pages=%s base_url_set=%s family=%s",
            ocr_provider,
            ocr_model,
            len(images),
            bool(ocr_base_url),
            vision_profile["family"],
        )
        page_texts: list[str] = []
        for idx, image_b64 in enumerate(images):
            if progress_callback is not None:
                progress_callback(idx, len(images))
            logger.info("OCR request provider=%s model=%s page=%s", ocr_provider, ocr_model, idx + 1)
            messages = []
            if bool(vision_profile["use_system_prompt"]):
                messages.append(
                    {
                        "role": "system",
                        "content": "You are an OCR parser. Extract all readable text from the page faithfully.",
                    }
                )
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}",
                                "detail": str(vision_profile["detail"]),
                            },
                        },
                        {"type": "text", "text": str(vision_profile["prompt"])},
                    ],
                }
            )
            context = ExecutionContext(
                messages=messages,
                stream=True,
                temperature=0,
            )
            parts: list[str] = []
            async for chunk in adapter.execute(
                context=context,
                api_key=ocr_api_key,
                model=ocr_model,
                base_url=ocr_base_url or None,
            ):
                if chunk.type == "error":
                    raise RuntimeError(chunk.error or "OCR model request failed")
                if chunk.type == "text" and chunk.content:
                    parts.append(chunk.content)
            text = self._sanitize_ocr_text("".join(parts))
            if text:
                page_texts.append(text)
                logger.info(
                    "OCR response provider=%s model=%s page=%s chars=%s",
                    ocr_provider,
                    ocr_model,
                    idx + 1,
                    len(text),
                )
            else:
                logger.warning("OCR model returned empty text on page %s", idx + 1)
        if progress_callback is not None:
            progress_callback(len(images), len(images))
        return "\n\n".join(page_texts).strip()

    async def _index_pdf_via_ocr_model(
        self,
        *,
        paths: DocumentPaths,
        document_id: str,
        filename: str,
        raw_bytes: bytes,
        ocr_provider: str,
        ocr_model: str,
        ocr_api_key: str,
        ocr_base_url: str,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict[str, Any] | None:
        text_to_tree = self._get_text_to_tree_fn()
        fts_index_cls = self._get_fts_index_cls()
        extracted_text = await self._call_ocr_model_for_pdf(
            raw_bytes=raw_bytes,
            ocr_provider=ocr_provider,
            ocr_model=ocr_model,
            ocr_api_key=ocr_api_key,
            ocr_base_url=ocr_base_url,
            progress_callback=progress_callback,
        )
        if not extracted_text:
            return None

        result = await text_to_tree(
            text_content=extracted_text,
            if_add_node_text=True,
            if_add_doc_description=True,
        )

        from treesearch import Document

        document = Document(
            doc_id=str(document_id),
            doc_name=result.get("doc_name") or Path(filename).stem,
            structure=result.get("structure", []),
            doc_description=result.get("doc_description", ""),
            metadata={"source_path": str(paths.original_file)},
            source_type="pdf",
        )
        fts = fts_index_cls(db_path=str(paths.index_db))
        fts.save_document(document)
        fts.index_document(document, force=True)
        fts.close()
        return self._serialize_document_summary(document)

    @staticmethod
    def _flatten_nodes(structure: Any) -> list[dict]:
        nodes: list[dict] = []
        if isinstance(structure, dict):
            nodes.append(structure)
            nodes.extend(TreeSearchDocumentService._flatten_nodes(structure.get("nodes", [])))
        elif isinstance(structure, list):
            for item in structure:
                nodes.extend(TreeSearchDocumentService._flatten_nodes(item))
        return nodes

    def _serialize_document_summary(self, document: Any) -> dict[str, Any]:
        nodes = self._flatten_nodes(getattr(document, "structure", []))
        texts = []
        for node in nodes:
            text = str(node.get("text", "")).strip()
            if text:
                texts.append(text)
        content_text = "\n\n".join(texts).strip()
        section_count = sum(1 for node in nodes if node.get("nodes"))
        return {
            "content_text": content_text,
            "character_count": len(content_text),
            "node_count": len(nodes),
            "section_count": section_count,
            "doc_name": getattr(document, "doc_name", ""),
            "source_type": getattr(document, "source_type", ""),
        }

    @staticmethod
    def _needs_doc_name_fallback(value: Any) -> bool:
        text = str(value or "").strip().lower()
        return not text or text == "untitled"

    def _resolve_document_display_name(self, *, space_id: str, document_id: str, fallback: str = "Document") -> str:
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
        if paths.original_dir.exists():
            for candidate in sorted(paths.original_dir.iterdir()):
                if candidate.is_file():
                    return candidate.stem or candidate.name or fallback
        return fallback

    async def index_document(
        self,
        *,
        space_id: str,
        document_id: str,
        filename: str,
        raw_bytes: bytes,
        enable_pdf_ocr: bool = False,
        ocr_provider: str = "",
        ocr_model: str = "",
        ocr_api_key: str = "",
        ocr_base_url: str = "",
        progress_callback: Callable[[int, int], None] | None = None,
    ):
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename=filename)
        paths.original_dir.mkdir(parents=True, exist_ok=True)
        paths.treesearch_dir.mkdir(parents=True, exist_ok=True)
        paths.original_file.write_bytes(raw_bytes)

        suffix = Path(filename).suffix.lower()
        parse_mode = "native"
        ocr_summary: dict[str, Any] | None = None
        ocr_debug: dict[str, Any] = {
            "ocr_enabled": bool(enable_pdf_ocr and suffix == ".pdf"),
            "ocr_provider": ocr_provider or "",
            "ocr_model": ocr_model or "",
            "ocr_api_key_set": bool(ocr_api_key),
            "ocr_base_url_set": bool(ocr_base_url),
            "ocr_invoked": False,
            "total_pages": 0,
        }
        if enable_pdf_ocr and suffix == ".pdf":
            ocr_debug["total_pages"] = self._count_pdf_pages(raw_bytes)
            if not ocr_provider or not ocr_model:
                raise RuntimeError("OCR enabled but OCR provider/model is missing")
            if not ocr_api_key:
                raise RuntimeError("OCR enabled but OCR API key is missing")
            ocr_summary = await self._index_pdf_via_ocr_model(
                paths=paths,
                document_id=document_id,
                filename=filename,
                raw_bytes=raw_bytes,
                ocr_provider=ocr_provider,
                ocr_model=ocr_model,
                ocr_api_key=ocr_api_key,
                ocr_base_url=ocr_base_url,
                progress_callback=progress_callback,
            )
            if not ocr_summary:
                raise RuntimeError("OCR model returned empty text for this PDF")
            parse_mode = "ocr_model"
            ocr_debug["ocr_invoked"] = True
        else:
            await self._index_via_treesearch(paths=paths)

        document_summary = self._load_document_summary(paths=paths) or ocr_summary

        result = {
            "document_root": str(paths.root),
            "original_file": str(paths.original_file),
            "index_db": str(paths.index_db),
            "parse_mode": parse_mode,
            "ocr_debug": ocr_debug,
        }
        if document_summary:
            result.update(document_summary)
        return result

    async def search_documents(
        self,
        *,
        space_id: str,
        document_ids: list[str],
        query_text: str,
        top_k: int = 5,
    ):
        trimmed_query = str(query_text or "").strip()
        normalized_ids = [str(document_id) for document_id in (document_ids or []) if str(document_id)]
        if not trimmed_query or not normalized_ids:
            return {"documents": [], "query": trimmed_query}

        load_documents = self._get_load_documents()
        search_fn = self._get_search_fn()

        documents: list[Any] = []
        for document_id in normalized_ids:
            paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
            if not paths.index_db.exists():
                continue
            documents.extend(load_documents(str(paths.index_db)))

        if not documents:
            return {"documents": [], "query": trimmed_query}

        raw = await search_fn(
            query=trimmed_query,
            documents=documents,
            top_k_docs=max(len(documents), 1),
            max_nodes_per_doc=max(top_k, 1),
            include_ancestors=True,
            text_mode="full",
            merge_strategy="interleave",
        )
        for item in raw.get("documents", []) if isinstance(raw, dict) else []:
            doc_id = str(item.get("doc_id") or "").strip()
            if not doc_id:
                continue
            if self._needs_doc_name_fallback(item.get("doc_name")):
                item["doc_name"] = self._resolve_document_display_name(
                    space_id=space_id,
                    document_id=doc_id,
                    fallback="Document",
                )
        return raw

    async def delete_document_index(self, *, space_id: str, document_id: str):
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
        if paths.root.exists():
            shutil.rmtree(paths.root)
        return {"deleted": True, "document_root": str(paths.root)}

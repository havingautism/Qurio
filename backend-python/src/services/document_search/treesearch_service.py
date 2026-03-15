from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
import inspect
import logging
from pathlib import Path
import re
import shutil
from typing import Any, Awaitable, Callable

import pypdfium2 as pdfium
from pypdf import PdfReader
from src.providers import ExecutionContext, get_provider_adapter
from src.services.llm_utils import safe_json_parse

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
        retrieval_plan_fn: Callable[..., Awaitable[dict[str, Any]] | dict[str, Any]] | None = None,
    ):
        self.storage_root = Path(storage_root)
        self._treesearch_cls = treesearch_cls
        self._load_documents_fn = load_documents_fn
        self._search_fn = search_fn
        self._text_to_tree_fn = text_to_tree_fn
        self._fts_index_cls = fts_index_cls
        self._ocr_parse_fn = ocr_parse_fn
        self._retrieval_plan_fn = retrieval_plan_fn

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
    def _default_retrieval_plan(query_text: str) -> dict[str, Any]:
        query = str(query_text or "").strip()
        return {
            "primary_query": query,
            "query_variants": [],
            "must_terms": [],
            "aliases": {},
            "context_policy": "parent_and_siblings",
        }

    @staticmethod
    def _normalize_retrieval_plan(query_text: str, raw_plan: Any) -> dict[str, Any]:
        fallback = TreeSearchDocumentService._default_retrieval_plan(query_text)
        if not isinstance(raw_plan, dict):
            return fallback

        primary = str(raw_plan.get("primary_query") or "").strip() or fallback["primary_query"]
        raw_variants = raw_plan.get("query_variants")
        variants = []
        if isinstance(raw_variants, list):
            seen = {primary.lower()}
            for item in raw_variants:
                text = str(item or "").strip()
                if not text:
                    continue
                key = text.lower()
                if key in seen:
                    continue
                variants.append(text)
                seen.add(key)
                if len(variants) >= 6:
                    break

        raw_must_terms = raw_plan.get("must_terms")
        must_terms: list[str] = []
        if isinstance(raw_must_terms, list):
            for item in raw_must_terms:
                term = str(item or "").strip()
                if term:
                    must_terms.append(term)
                if len(must_terms) >= 8:
                    break

        aliases: dict[str, list[str]] = {}
        raw_aliases = raw_plan.get("aliases")
        if isinstance(raw_aliases, dict):
            for key, value in raw_aliases.items():
                alias_key = str(key or "").strip()
                if not alias_key:
                    continue
                values = value if isinstance(value, list) else [value]
                normalized_values = [str(item or "").strip() for item in values if str(item or "").strip()]
                if normalized_values:
                    aliases[alias_key] = normalized_values[:8]
                if len(aliases) >= 8:
                    break

        context_policy = str(raw_plan.get("context_policy") or "").strip() or "parent_and_siblings"
        if context_policy not in {"parent_and_siblings", "parent_only", "node_only"}:
            context_policy = "parent_and_siblings"

        return {
            "primary_query": primary,
            "query_variants": variants,
            "must_terms": must_terms,
            "aliases": aliases,
            "context_policy": context_policy,
        }

    async def _plan_retrieval(
        self,
        *,
        query_text: str,
        lite_provider: str = "",
        lite_model: str = "",
        lite_api_key: str = "",
        lite_base_url: str = "",
        use_lite_retrieval_plan: bool = True,
    ) -> dict[str, Any]:
        trimmed_query = str(query_text or "").strip()
        if not trimmed_query:
            return self._default_retrieval_plan(trimmed_query)

        if self._retrieval_plan_fn is not None:
            raw = self._retrieval_plan_fn(
                query_text=trimmed_query,
                lite_provider=lite_provider,
                lite_model=lite_model,
                lite_api_key=lite_api_key,
                lite_base_url=lite_base_url,
                use_lite_retrieval_plan=use_lite_retrieval_plan,
            )
            if inspect.isawaitable(raw):
                raw = await raw
            return self._normalize_retrieval_plan(trimmed_query, raw)

        if (
            not use_lite_retrieval_plan
            or not str(lite_provider or "").strip()
            or not str(lite_model or "").strip()
            or not str(lite_api_key or "").strip()
        ):
            return self._default_retrieval_plan(trimmed_query)

        prompt = (
            "Create a retrieval plan in STRICT JSON for lexical document search.\n"
            "Return only one JSON object with keys:\n"
            "primary_query (string), query_variants (string[]), must_terms (string[]), "
            "aliases (object<string,string[]>), context_policy (string).\n"
            "Rules:\n"
            "- Keep primary_query concise and faithful to user intent.\n"
            "- query_variants must be short lexical variants (max 6).\n"
            "- must_terms include critical exact terms when necessary.\n"
            "- aliases map user terms to possible synonyms for lexical retrieval.\n"
            "- context_policy must be one of: parent_and_siblings, parent_only, node_only.\n"
            f'User query: "{trimmed_query}"'
        )
        adapter = get_provider_adapter(str(lite_provider).strip())
        context = ExecutionContext(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a retrieval planner. Output JSON only. "
                        "No markdown, no explanation."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            stream=True,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        chunks: list[str] = []
        try:
            async for chunk in adapter.execute(
                context=context,
                api_key=str(lite_api_key).strip(),
                model=str(lite_model).strip(),
                base_url=str(lite_base_url or "").strip() or None,
            ):
                if chunk.type == "error":
                    raise RuntimeError(chunk.error or "Retrieval planner failed")
                if chunk.type == "text" and chunk.content:
                    chunks.append(chunk.content)
        except Exception as exc:
            logger.warning("Lite retrieval planner failed, fallback to single-query search: %s", exc)
            return self._default_retrieval_plan(trimmed_query)

        raw_text = "".join(chunks).strip()
        parsed = safe_json_parse(raw_text)
        return self._normalize_retrieval_plan(trimmed_query, parsed)

    async def _run_search_query(
        self,
        *,
        search_fn: Callable[..., Any],
        query: str,
        documents: list[Any],
        top_k: int,
    ) -> dict[str, Any]:
        result = search_fn(
            query=query,
            documents=documents,
            top_k_docs=max(len(documents), 1),
            max_nodes_per_doc=max(top_k, 1),
            include_ancestors=True,
            text_mode="full",
            merge_strategy="interleave",
        )
        if inspect.isawaitable(result):
            result = await result
        return result if isinstance(result, dict) else {"documents": []}

    @staticmethod
    def _collect_alias_terms(aliases: dict[str, list[str]]) -> list[str]:
        terms: list[str] = []
        for key, values in aliases.items():
            text_key = str(key or "").strip()
            if text_key:
                terms.append(text_key)
            for value in values or []:
                text_value = str(value or "").strip()
                if text_value:
                    terms.append(text_value)
        return terms

    @staticmethod
    def _derive_anchor_terms(*, query_text: str, retrieval_plan: dict[str, Any]) -> list[str]:
        stop_terms = {
            "的",
            "和",
            "与",
            "及",
            "或",
            "the",
            "a",
            "an",
            "and",
            "or",
            "for",
            "to",
            "in",
            "on",
            "with",
            "what",
            "how",
            "is",
            "are",
        }
        candidates: list[str] = []
        candidates.extend([str(v or "").strip() for v in retrieval_plan.get("must_terms", [])])
        candidates.extend(TreeSearchDocumentService._collect_alias_terms(retrieval_plan.get("aliases", {})))
        candidates.append(str(query_text or "").strip())
        candidates.append(str(retrieval_plan.get("primary_query") or "").strip())
        candidates.extend([str(v or "").strip() for v in retrieval_plan.get("query_variants", [])])

        seen: set[str] = set()
        anchor_terms: list[str] = []
        for raw in candidates:
            if not raw:
                continue
            parts = re.split(r"[\s,，。；;:：|/\\()\[\]{}<>\"'“”‘’!！?？]+", raw)
            for part in parts:
                term = str(part or "").strip()
                if len(term) < 2:
                    continue
                lowered = term.lower()
                if lowered in stop_terms or lowered in seen:
                    continue
                anchor_terms.append(term)
                seen.add(lowered)
                if len(anchor_terms) >= 12:
                    return anchor_terms
        return anchor_terms

    @staticmethod
    def _compute_min_anchor_hits(anchor_terms: list[str]) -> int:
        size = len(anchor_terms or [])
        if size <= 0:
            return 0
        if size <= 3:
            return 1
        if size <= 6:
            return 2
        return 3

    @staticmethod
    def _compute_qa_signal_bonus(combined_lower: str) -> float:
        if not combined_lower:
            return 0.0
        qa_signals = [
            "什么是",
            "如何",
            "区别",
            "原理",
            "优缺点",
            "?",
            "？",
            "why",
            "what is",
            "how to",
            "difference",
            "pros and cons",
        ]
        hits = sum(1 for signal in qa_signals if signal in combined_lower)
        if hits <= 0:
            return 0.0
        return min(0.22, 0.06 + (hits - 1) * 0.04)

    def _merge_retrieval_results(
        self,
        *,
        merged_documents: dict[str, dict[str, Any]],
        raw_result: dict[str, Any],
        query_label: str,
        query_weight: float,
        must_terms: list[str],
        alias_terms: list[str],
        anchor_terms: list[str],
        min_anchor_hits: int,
        allowed_doc_ids: set[str],
    ) -> None:
        must_terms_lower = [term.lower() for term in must_terms if term]
        alias_terms_lower = [term.lower() for term in alias_terms if term]
        anchor_terms_lower = [term.lower() for term in anchor_terms if term]
        for item in raw_result.get("documents", []) if isinstance(raw_result, dict) else []:
            doc_id = str(item.get("doc_id") or "").strip()
            if not doc_id:
                continue
            if allowed_doc_ids and doc_id not in allowed_doc_ids:
                continue
            doc_entry = merged_documents.setdefault(
                doc_id,
                {
                    "doc_id": doc_id,
                    "doc_name": item.get("doc_name") or "Document",
                    "_node_map": {},
                },
            )
            if self._needs_doc_name_fallback(doc_entry.get("doc_name")):
                doc_entry["doc_name"] = item.get("doc_name") or "Document"

            for node in item.get("nodes", []) if isinstance(item.get("nodes"), list) else []:
                node_id = str(node.get("node_id") or "").strip()
                text = str(node.get("text") or "").strip()
                summary = str(node.get("summary") or "").strip()
                title = str(node.get("title") or "").strip()
                candidate_text = summary if len(summary) > len(text) else text
                if not candidate_text:
                    candidate_text = title
                ancestors = node.get("ancestors") if isinstance(node.get("ancestors"), list) else []
                combined_text = " ".join(
                    [
                        title,
                        text,
                        summary,
                        " ".join([str(value or "").strip() for value in ancestors if str(value or "").strip()]),
                    ]
                ).strip()
                combined_lower = combined_text.lower()
                key = node_id or f"text::{hash(text)}"
                base_score = float(node.get("score") or 0.0)
                matched_must_terms = [term for term in must_terms_lower if term in combined_lower]
                if must_terms_lower and not matched_must_terms:
                    continue
                matched_anchor_terms = [term for term in anchor_terms_lower if term in combined_lower]
                if min_anchor_hits > 0 and len(matched_anchor_terms) < min_anchor_hits:
                    continue
                must_coverage = (
                    len(matched_must_terms) / len(must_terms_lower) if must_terms_lower else 1.0
                )
                must_factor = 0.55 + (0.45 * must_coverage)
                if len(candidate_text) < 40:
                    length_factor = 0.35
                elif len(candidate_text) < 80:
                    length_factor = 0.55
                elif len(candidate_text) < 120:
                    length_factor = 0.75
                elif len(candidate_text) < 180:
                    length_factor = 0.9
                else:
                    length_factor = 1.0
                must_bonus = 0.15 if must_terms_lower and all(
                    term in combined_lower for term in must_terms_lower
                ) else 0.0
                alias_bonus = 0.05 if alias_terms_lower and any(
                    term in combined_lower for term in alias_terms_lower
                ) else 0.0
                qa_signal_bonus = self._compute_qa_signal_bonus(combined_lower)
                rerank_score = (
                    (base_score * query_weight * must_factor * length_factor)
                    + must_bonus
                    + alias_bonus
                    + qa_signal_bonus
                )

                existing = doc_entry["_node_map"].get(key)
                if existing is None:
                    next_node = dict(node)
                    next_node["text"] = candidate_text
                    next_node["rerank_score"] = rerank_score
                    next_node["matched_queries"] = [query_label]
                    doc_entry["_node_map"][key] = next_node
                else:
                    existing["rerank_score"] = float(existing.get("rerank_score") or 0.0) + rerank_score
                    if len(candidate_text) > len(str(existing.get("text") or "")):
                        existing["text"] = candidate_text
                    matched = existing.setdefault("matched_queries", [])
                    if query_label not in matched:
                        matched.append(query_label)

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
        lite_provider: str = "",
        lite_model: str = "",
        lite_api_key: str = "",
        lite_base_url: str = "",
        use_lite_retrieval_plan: bool = True,
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
        allowed_doc_ids = set(normalized_ids)

        retrieval_plan = await self._plan_retrieval(
            query_text=trimmed_query,
            lite_provider=lite_provider,
            lite_model=lite_model,
            lite_api_key=lite_api_key,
            lite_base_url=lite_base_url,
            use_lite_retrieval_plan=use_lite_retrieval_plan,
        )
        primary_query = str(retrieval_plan.get("primary_query") or trimmed_query).strip() or trimmed_query
        variants = [
            str(item).strip()
            for item in retrieval_plan.get("query_variants", [])
            if str(item).strip()
        ][:4]
        must_terms = [str(item).strip() for item in retrieval_plan.get("must_terms", []) if str(item).strip()]
        alias_terms = self._collect_alias_terms(retrieval_plan.get("aliases", {}))
        anchor_terms = self._derive_anchor_terms(query_text=trimmed_query, retrieval_plan=retrieval_plan)
        min_anchor_hits = self._compute_min_anchor_hits(anchor_terms)

        query_jobs: list[tuple[str, str, float, int]] = [(primary_query, "primary", 1.0, max(top_k * 2, 10))]
        for variant in variants:
            query_jobs.append((variant, "variant", 0.82, max(top_k, 5)))

        merged_documents: dict[str, dict[str, Any]] = {}
        debug_queries: list[dict[str, Any]] = []
        raw_results: list[tuple[dict[str, Any], str, str, float]] = []
        for query_value, label, weight, max_nodes in query_jobs:
            raw = await self._run_search_query(
                search_fn=search_fn,
                query=query_value,
                documents=documents,
                top_k=max_nodes,
            )
            labeled_query = query_value if label == "primary" else f"{label}:{query_value}"
            raw_results.append((raw, query_value, labeled_query, weight))
            debug_queries.append(
                {
                    "query": query_value,
                    "label": label,
                    "weight": weight,
                    "documents": len(raw.get("documents", []) if isinstance(raw, dict) else []),
                }
            )
            self._merge_retrieval_results(
                merged_documents=merged_documents,
                raw_result=raw,
                query_label=labeled_query,
                query_weight=weight,
                must_terms=must_terms,
                alias_terms=alias_terms,
                anchor_terms=anchor_terms,
                min_anchor_hits=min_anchor_hits,
                allowed_doc_ids=allowed_doc_ids,
            )
        fallback_triggered = False
        effective_min_anchor_hits = min_anchor_hits
        has_ranked_nodes = any(
            isinstance(entry.get("_node_map"), dict) and bool(entry.get("_node_map"))
            for entry in merged_documents.values()
        )
        if min_anchor_hits > 0 and not has_ranked_nodes:
            fallback_triggered = True
            effective_min_anchor_hits = 0
            for raw, _query_value, labeled_query, weight in raw_results:
                self._merge_retrieval_results(
                    merged_documents=merged_documents,
                    raw_result=raw,
                    query_label=labeled_query,
                    query_weight=weight,
                    must_terms=must_terms,
                    alias_terms=alias_terms,
                    anchor_terms=anchor_terms,
                    min_anchor_hits=0,
                    allowed_doc_ids=allowed_doc_ids,
                )

        result_documents: list[dict[str, Any]] = []
        for doc_id, entry in merged_documents.items():
            nodes = list(entry.get("_node_map", {}).values())
            nodes.sort(key=lambda node: float(node.get("rerank_score") or 0.0), reverse=True)
            if not nodes:
                continue
            paragraph_nodes = [
                node for node in nodes if len(str(node.get("text") or "").strip()) >= 90
            ]
            candidate_nodes = paragraph_nodes if paragraph_nodes else nodes
            trimmed_nodes = candidate_nodes[: max(top_k, 1)]
            doc_name = entry.get("doc_name")
            if self._needs_doc_name_fallback(doc_name):
                doc_name = self._resolve_document_display_name(
                    space_id=space_id,
                    document_id=doc_id,
                    fallback="Document",
                )
            result_documents.append(
                {
                    "doc_id": doc_id,
                    "doc_name": doc_name,
                    "nodes": trimmed_nodes,
                }
            )

        result_documents.sort(
            key=lambda item: float(
                item.get("nodes", [{}])[0].get("rerank_score", 0.0) if item.get("nodes") else 0.0
            ),
            reverse=True,
        )

        return {
            "documents": result_documents,
            "query": trimmed_query,
            "retrieval_plan": retrieval_plan,
            "retrieval_debug": {
                "queries": debug_queries,
                "anchor_terms": anchor_terms,
                "min_anchor_hits": min_anchor_hits,
                "effective_min_anchor_hits": effective_min_anchor_hits,
                "anchor_fallback_triggered": fallback_triggered,
            },
        }

    async def delete_document_index(self, *, space_id: str, document_id: str):
        paths = self.get_document_paths(space_id=space_id, document_id=document_id, filename="document")
        if paths.root.exists():
            shutil.rmtree(paths.root)
        return {"deleted": True, "document_root": str(paths.root)}

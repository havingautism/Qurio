# Document Engine

`document_engine` is Qurio's internal document retrieval kernel.

Its job is to provide a stable, provider-agnostic foundation for:

- document parsing
- optional OCR-driven parsing
- document structure building
- index storage
- retrieval execution
- normalized search hits for prompt assembly and citations

## Positioning

This module should be treated as Qurio's long-term document search core.

Current status:

- internal module name: `document_engine`
- long-term external project direction: `NodeSeek` or equivalent structured retrieval engine branding
- current default runtime engine: structured lexical engine

Important:

- all new runtime entry points should depend on `document_engine`
- retrieval behavior should be expressed through internal contracts, not through third-party engine APIs

## Design Principles

1. Provider-agnostic
   Metadata storage may live in SQLite, Supabase, Postgres, or other systems.
   Retrieval contracts must remain stable regardless of the backing store.

2. Structured retrieval first
   The engine is designed around document trees and node-level evidence, not embedding-only retrieval.

3. Explicit OCR policy
   OCR is opt-in. If OCR is enabled, a concrete OCR provider and model must be configured. There is no implicit native-first fallback in OCR mode.

4. Stable evidence contract
   Upstream engines may differ, but normalized retrieval output must converge to `SearchHit`.

5. Replaceable implementations
   Parsers, OCR providers, structure builders, backends, and engines must all be swappable.

## Current Module Layout

```text
document_engine/
├── contracts.py
├── service.py
├── parsers/
├── structure/
├── index_backends/
└── engines/
```

### `contracts.py`

Defines stable internal protocols and data objects:

- `DocumentEngineConfig`
- `OcrConfig`
- `ParsedDocument`
- `StructuredDocument`
- `SearchHit`

These contracts are the long-term compatibility boundary.

### `service.py`

Defines `DocumentEngineService`, the orchestration layer used by routes and application services.

This service is responsible for:

- selecting the parser strategy
- validating OCR configuration
- building a structured document
- delegating indexing and search to the configured engine/backend

### `parsers/`

Contains raw file parsers and OCR integration points.

Current default parsers:

- Markdown
- PDF
- DOCX
- text-like files (`txt`, `csv`, `json`)

Current OCR status:

- `NoopOcrProvider` only
- OCR mode is intentionally explicit and currently not production-enabled

### `structure/`

Contains structure builders that convert parsed text into a normalized document tree.

Current default:

- heading-rule-driven structure builder
- suitable for markdown, text, PDF-extracted text, and DOCX-extracted text

### `index_backends/`

Defines how engine state is stored.

Current default:

- filesystem-backed per-document storage

Current layout:

```text
data/document_index/
  spaces/{space_id}/documents/{document_id}/
    original/
    index/
```

### `engines/`

Defines retrieval engine implementations.

Current default:

- `StructuredLexicalEngine`

Long-term direction:

- self-owned lexical structured retrieval engine
- backend-specific lexical adapters for SQLite and Postgres/Supabase

## Runtime Policy

The application should only talk to `DocumentEngineService`.

Do this:

- route -> `DocumentEngineService`
- service -> parser / structure builder / backend / engine

Do not do this:

- route -> parser-specific logic directly
- route -> backend-specific retrieval logic directly

## OCR Policy

The parser strategy is explicit.

### OCR disabled

- use native parser path
- PDF uses native PDF extraction
- DOCX uses native DOCX extraction

### OCR enabled

- `ocr_provider` is required
- `ocr_model` is required
- the document is parsed through the OCR path
- there is no implicit fallback to native extraction in OCR mode

This keeps behavior predictable and debuggable.

## Current Defaults

The current runtime is intentionally conservative:

- parser: native parser registry
- OCR provider: noop
- structure builder: heading-based default builder
- backend: filesystem backend
- engine: self-owned structured lexical engine

## Near-Term Roadmap

1. Add a real OCR provider behind the OCR base interface.
2. Introduce backend-agnostic lexical search contracts.
3. Add SQLite and Postgres/Supabase lexical backends under the same engine contract.
4. Improve structure-aware scoring and neighbor expansion.
5. Move citation generation onto engine-native node evidence rather than heuristic post-processing.

## Naming Guidance

Use these terms consistently:

- internal module: `document_engine`
- current implementation: `StructuredLexicalEngine`
- long-term engine category: `structured retrieval engine`
- potential external project codename: `NodeSeek`

Avoid:

- describing the long-term system as embedding-based RAG
- coupling retrieval language to a single database provider

## Migration Rule

Legacy modules may remain in the repository temporarily, but they should be treated as compatibility code.

New work should be added under `document_engine/` unless there is a strong reason not to.

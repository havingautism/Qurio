# PPT Preview Fidelity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore styled HTML preview for PPT generation while making exported PPT files prefer a fidelity path that preserves layout, colors, and images.

**Architecture:** Split PPT handling into two clear tracks. Preview uses the original HTML slide units with shared styles, while PPT export prefers screenshot-based fidelity rendering whenever slide boundaries are available and falls back to semantic reconstruction only when fidelity is unavailable or unsuitable.

**Tech Stack:** Python, FastAPI service helpers, Playwright, python-pptx, React frontend payload consumption

---

## Chunk 1: Schema And Tool Contract

### Task 1: Normalize incoming PPT render modes and strengthen tool guidance

**Files:**
- Modify: `backend-python/src/services/pptx_schema.py`
- Modify: `backend-python/src/services/tool_registry.py`

- [ ] **Step 1: Add render mode alias normalization**
- [ ] **Step 2: Treat `presentable` and similar aliases as fidelity-preferred**
- [ ] **Step 3: Tighten tool descriptions to prefer `slides_html` over single long `html` for multi-slide decks**
- [ ] **Step 4: Keep backward compatibility for single-HTML payloads**

## Chunk 2: Builder Split

### Task 2: Restore raw HTML preview generation

**Files:**
- Modify: `backend-python/src/services/pptx_builder.py`

- [ ] **Step 1: Preserve original slide units and shared styles for preview**
- [ ] **Step 2: Build preview from raw HTML slide units instead of semantic preview documents**
- [ ] **Step 3: Keep preview pagination tied to original slide units**

### Task 3: Prefer fidelity export for downloadable PPTX

**Files:**
- Modify: `backend-python/src/services/pptx_builder.py`

- [ ] **Step 1: Enable fidelity path when render mode requests it or auto mode has slide-based HTML**
- [ ] **Step 2: Use one screenshot per slide unit for exported PPT pages**
- [ ] **Step 3: Fall back to semantic mode only when fidelity cannot be used**
- [ ] **Step 4: Record fallback reason in QA issues**

## Chunk 3: Payload And Verification

### Task 4: Keep payload stable and verify end-to-end behavior

**Files:**
- Modify: `backend-python/src/services/tools.py`
- Modify: `backend-python/src/services/custom_tools.py`

- [ ] **Step 1: Ensure preview payload remains compatible with frontend expectations**
- [ ] **Step 2: Run backend compile checks**
- [ ] **Step 3: Run frontend build**
- [ ] **Step 4: Summarize residual limits clearly, especially for single long HTML without explicit slide boundaries**

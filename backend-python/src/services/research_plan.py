"""
Research plan generation services.
"""

from __future__ import annotations

import json
from typing import Any

from ..models.stream_chat import StreamChatRequest
from .llm_utils import run_agent_completion, safe_json_parse


def build_research_plan_messages(user_message: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are a task planner. Produce a detailed, execution-ready research plan in structured JSON.\n\n"
                "Input\n"
                "User message contains:\n"
                '- "question": research question\n'
                '- "scope": research scope, or "Auto"\n'
                '- "output": output format preference, or "Auto"\n\n'
                "Planning Rules\n"
                "1. Detect question type:\n"
                "   - Definition: 2-3 steps, define -> characteristics -> applications\n"
                "   - Comparison: 3-4 steps, differences -> scenarios -> trade-offs -> decision\n"
                "   - How-it-works: 4-5 steps, overview -> deep dive -> examples -> edge cases\n"
                "   - How-to: 4-6 steps, prerequisites -> process -> alternatives -> pitfalls\n"
                "   - Analysis: 5-7 steps, context -> factors -> evidence -> implications -> recommendations\n"
                "   - History: 3-5 steps, timeline -> milestones -> causes -> effects\n"
                "2. Hybrid questions: assign 70-80% steps to primary type, 20-30% to secondary\n"
                "3. Step count must match complexity:\n"
                "   - simple: 2-3 steps\n"
                "   - medium: 4-5 steps (default)\n"
                "   - complex: 6-8 steps\n"
                '4. If scope/output is "Auto", choose formats:\n'
                "   - Definition: paragraph\n"
                "   - Comparison: table + bullet_list\n"
                "   - How-it-works: paragraph + code_example\n"
                "   - How-to: numbered_list + checklist\n"
                "   - Analysis: mix formats\n"
                "   - History: paragraph or timeline\n"
                "5. Depth:\n"
                "   - low: 1-2 paragraphs (~100-200 words)\n"
                "   - medium: 3-4 paragraphs (~300-500 words)\n"
                "   - high: 5+ paragraphs (~600+ words)\n"
                "6. Step 1 must list assumptions if needed; all steps use these assumptions\n"
                "7. Steps must be sequential, each with a clear, unique purpose, and executable using previous outputs\n"
                "8. For each step, determine if search is needed:\n"
                "   - Add \"requires_search\": true if the step needs up-to-date data, benchmarks, or external verification\n"
                "   - Add \"requires_search\": false if the step relies on stable knowledge, definitions, or established concepts\n"
                "   - Examples:\n"
                '     * "Define HTTP" -> requires_search: false (stable concept)\n'
                '     * "Compare latest AI framework benchmarks" -> requires_search: true (current data needed)\n'
                '     * "Explain React component lifecycle" -> requires_search: false (stable knowledge)\n'
                '     * "List current React job market trends" -> requires_search: true (time-sensitive)\n\n'
                "Deliverable Formats\n"
                "paragraph, bullet_list, numbered_list, table, checklist, code_example, pros_and_cons\n\n"
                "Output Schema\n"
                "Return ONLY valid JSON, no markdown, no commentary:\n"
                "{\n"
                '  "research_type": "general",\n'
                '  "goal": "string",\n'
                '  "complexity": "simple|medium|complex",\n'
                '  "question_type": "definition|comparison|how_it_works|how_to|analysis|history",\n'
                '  "assumptions": ["string"],\n'
                '  "plan": [\n'
                "    {\n"
                '      "step": 1,\n'
                '      "thought": "short reasoning explaining purpose of this step",\n'
                '      "action": "specific, executable action",\n'
                '      "expected_output": "what this step produces, with format and detail",\n'
                '      "deliverable_format": "paragraph|bullet_list|numbered_list|table|checklist|code_example|pros_and_cons",\n'
                '      "acceptance_criteria": ["must include X", "must cover Y"],\n'
                '      "depth": "low|medium|high",\n'
                '      "requires_search": true|false\n'
                "    }\n"
                "  ],\n"
                '  "risks": ["potential issues to avoid"],\n'
                '  "success_criteria": ["how to tell if research succeeded"]\n'
                "}"
            ),
        },
        {"role": "user", "content": user_message},
    ]


def build_academic_research_plan_messages(user_message: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are an academic research planner. Produce a detailed, rigorous research plan in structured JSON for scholarly literature review and analysis.\n\n"
                "Input\n"
                "User message contains:\n"
                '- "question": academic research question or topic\n'
                '- "scope": research scope (time period, geographic region, specific databases, etc.), or "Auto"\n'
                '- "output": output format preference, or "Auto"\n\n'
                "Academic Research Question Types\n"
                "1. literature_review (4-6 steps)\n"
                "2. methodology_analysis (5-7 steps)\n"
                "3. empirical_study_review (6-8 steps)\n"
                "4. theoretical_framework (4-6 steps)\n"
                "5. state_of_the_art (5-7 steps)\n\n"
                "Academic Planning Rules\n"
                "1. Mandatory literature search steps (requires_search true).\n"
                "2. Emphasize evidence quality and peer review.\n"
                "3. Critical evaluation required for each step.\n"
                "4. Systematic approach with inclusion/exclusion criteria.\n"
                "5. Identify research gaps and limitations.\n"
                "6. Track citations and publication years.\n"
                "7. Default to requires_search: true unless theory is well-established.\n\n"
                "Deliverable Formats for Academic Research\n"
                "paragraph, bullet_list, numbered_list, table, annotated_bibliography, comparative_analysis, thematic_synthesis\n\n"
                "Output Schema\n"
                "Return ONLY valid JSON, no markdown, no commentary:\n"
                "{\n"
                '  "research_type": "academic",\n'
                '  "goal": "string - formal academic research objective",\n'
                '  "complexity": "simple|medium|complex",\n'
                '  "question_type": "literature_review|methodology_analysis|empirical_study_review|theoretical_framework|state_of_the_art",\n'
                '  "assumptions": ["string - research scope assumptions, exclusions, focus areas"],\n'
                '  "plan": [\n'
                "    {\n"
                '      "step": 1,\n'
                '      "thought": "research rationale for this step",\n'
                '      "action": "specific, executable academic research action",\n'
                '      "expected_output": "scholarly deliverable with format and rigor specified",\n'
                '      "deliverable_format": "paragraph|bullet_list|table|annotated_bibliography|comparative_analysis|thematic_synthesis",\n'
                '      "acceptance_criteria": ["methodological requirement", "quality threshold", "coverage expectation"],\n'
                '      "depth": "low|medium|high",\n'
                '      "requires_search": true|false\n'
                "    }\n"
                "  ],\n"
                '  "risks": ["potential methodological issues", "evidence limitations", "generalizability concerns"],\n'
                '  "success_criteria": ["scholarly standard for completion", "quality benchmark"]\n'
                "}"
            ),
        },
        {"role": "user", "content": user_message},
    ]


async def generate_research_plan(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
) -> str:
    messages = build_research_plan_messages(user_message)
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        responseFormat=response_format,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    parsed = safe_json_parse(content)
    if parsed is not None:
        try:
            return json.dumps(parsed, ensure_ascii=True, indent=2)
        except Exception:
            return content
    return content


async def generate_academic_research_plan(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
) -> str:
    messages = build_academic_research_plan_messages(user_message)
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        responseFormat=response_format,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    parsed = safe_json_parse(content)
    if parsed is not None:
        try:
            return json.dumps(parsed, ensure_ascii=True, indent=2)
        except Exception:
            return content
    return content

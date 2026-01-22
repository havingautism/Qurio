"""
Deep research agent service (planner/executor).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, Callable

from ..models.stream_chat import StreamChatRequest
from ..services.stream_chat import get_stream_chat_service
from .llm_utils import safe_json_parse
from .research_plan import generate_academic_research_plan, generate_research_plan


def parse_plan(plan_text: str | None) -> dict[str, Any]:
    parsed = safe_json_parse(plan_text or "")
    if isinstance(parsed, dict) and isinstance(parsed.get("plan"), list):
        return parsed
    return {
        "goal": "",
        "assumptions": [],
        "question_type": "analysis",
        "plan": [
            {
                "step": 1,
                "action": "Summarize the topic and gather key evidence.",
                "expected_output": "A concise summary with evidence.",
                "deliverable_format": "paragraph",
                "acceptance_criteria": [],
                "depth": "medium",
                "requires_search": True,
            }
        ],
    }


def build_sources_list(sources_map: dict[str, dict[str, Any]]) -> list[str]:
    sources = list(sources_map.values())
    lines = []
    for idx, source in enumerate(sources, start=1):
        title = source.get("title") or source.get("url") or source.get("uri") or f"Source {idx}"
        url = source.get("url") or source.get("uri") or ""
        lines.append(f"[{idx}] {title} {url}".strip())
    return lines


def build_step_prompt(
    *,
    plan_meta: dict[str, Any],
    step: dict[str, Any],
    step_index: int,
    prior_findings: list[str],
    sources_list: list[str],
    research_type: str,
) -> str:
    assumptions = plan_meta.get("assumptions") or []
    acceptance = step.get("acceptance_criteria") or []
    base_info = (
        f"Goal: {plan_meta.get('goal') or 'N/A'}\n"
        f"Question type: {plan_meta.get('question_type') or 'N/A'}\n"
        f"Step {step_index + 1}: {step.get('action') or ''}\n"
        f"Expected output: {step.get('expected_output') or 'N/A'}\n"
        f"Deliverable format: {step.get('deliverable_format') or 'paragraph'}\n"
        f"Depth: {step.get('depth') or 'medium'}\n"
        f"Requires search: {'true' if step.get('requires_search') else 'false'}\n\n"
        "Assumptions:\n"
        + ("\n".join([f"- {a}" for a in assumptions]) if assumptions else "- None")
        + "\n\nAcceptance criteria:\n"
        + ("\n".join([f"- {a}" for a in acceptance]) if acceptance else "- None")
        + "\n\nPrior findings:\n"
        + ("\n".join([f"- {f}" for f in prior_findings]) if prior_findings else "- None")
        + "\n\nKnown sources (cite as [index]):\n"
        + ("\n".join(sources_list) if sources_list else "- None")
    )

    if research_type == "academic":
        return (
            "You are executing an academic research plan step.\n\n"
            + base_info
            + "\n\nCRITICAL ACADEMIC REQUIREMENTS:\n"
            "1. Source quality: prioritize peer-reviewed sources and report venue/year.\n"
            "2. Evidence and citation: every factual claim must have citations [x].\n"
            "3. Critical evaluation: assess methodology, bias, and limitations.\n"
            "4. Scholarly language: formal tone, hedging, and precise terms.\n"
            "5. Systematic approach: follow acceptance criteria strictly.\n\n"
            "Instructions:\n"
            "- Use Tavily_academic_search or tavily_search tools as needed.\n"
            "- Cite sources as [1], [2], etc. based on Known sources.\n"
            "- If sources do not contain the answer, explicitly say so.\n"
        )

    return (
        "You are executing a structured research plan step.\n\n"
        + base_info
        + "\n\nInstructions:\n"
        "- Use the available tools when needed to gather evidence.\n"
        "- When citing sources, use [1], [2], etc. based on the known sources list.\n"
        "- Return a concise step output that can be used by subsequent steps.\n"
    )


def build_final_report_prompt(
    *,
    plan_meta: dict[str, Any],
    question: str | None,
    findings: list[str],
    sources_list: list[str],
    research_type: str,
) -> str:
    base_info = (
        f"Question: {question or plan_meta.get('goal') or 'N/A'}\n"
        f"Plan goal: {plan_meta.get('goal') or 'N/A'}\n"
        f"Question type: {plan_meta.get('question_type') or 'N/A'}\n\n"
        "Findings to synthesize:\n"
        + ("\n".join([f"- {f}" for f in findings]) if findings else "- None")
        + "\n\nSources (cite as [index]):\n"
        + ("\n".join(sources_list) if sources_list else "- None")
    )

    if research_type == "academic":
        return (
            "You are writing an academic research report based on a systematic literature review.\n\n"
            + base_info
            + "\n\nRequirements:\n"
            "- Use formal academic tone and strict citations.\n"
            "- Every factual claim must have citations [x].\n"
            "- Use the provided Sources list only.\n"
            "- Include a references section listing the Sources list exactly.\n"
        )

    return (
        "You are a deep research writer producing a final report.\n\n"
        + base_info
        + "\n\nRequirements:\n"
        "- Evidence-driven and traceable: every factual claim must be backed by a citation.\n"
        "- Include a short 'Self-check' section at the end with 3-5 bullets.\n"
        "- Use clear headings and complete the full report in one response.\n"
    )


def build_research_step_event(
    *,
    step_index: int,
    total_steps: int,
    title: str,
    status: str,
    duration_ms: int | None = None,
    error: Exception | None = None,
) -> dict[str, Any]:
    event = {
        "type": "research_step",
        "step": step_index + 1,
        "total": total_steps,
        "title": title,
        "status": status,
    }
    if duration_ms is not None:
        event["duration_ms"] = duration_ms
    if error is not None:
        event["error"] = str(error)
    return event


async def _run_step(
    *,
    service,
    step_messages: list[dict[str, Any]],
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str | None,
    tools: list[dict[str, Any]] | None,
    tool_choice: Any,
    tool_ids: list[str],
    response_format: dict[str, Any] | None,
    thinking: dict[str, Any] | bool | None,
    temperature: float | None,
    top_k: int | None,
    top_p: float | None,
    frequency_penalty: float | None,
    presence_penalty: float | None,
    context_message_limit: int | None,
    search_provider: str | None,
    tavily_api_key: str | None,
    step_index: int,
    total_steps: int,
    sources_map: dict[str, dict[str, Any]],
    emit_event: Callable[[dict[str, Any]], Any],
) -> str:
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=step_messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids,
        responseFormat=response_format,
        thinking=thinking,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        stream=True,
    )

    step_content = ""
    async for event in service.stream_chat(request):
        event_type = event.get("type")
        if event_type == "text":
            step_content += event.get("content", "")
        elif event_type in ("tool_call", "tool_result"):
            event["step"] = step_index + 1
            event["total"] = total_steps
            await emit_event(event)
        elif event_type == "done":
            for source in event.get("sources") or []:
                uri = source.get("uri")
                if uri:
                    sources_map[uri] = source
        elif event_type == "error":
            raise RuntimeError(event.get("error") or "Step execution error")
    return step_content


async def stream_deep_research(params: dict[str, Any]) -> AsyncGenerator[dict[str, Any], None]:
    provider = params.get("provider")
    api_key = params.get("api_key") or params.get("apiKey")
    base_url = params.get("base_url") or params.get("baseUrl")
    model = params.get("model")
    messages = params.get("messages") or []
    tools = params.get("tools") or []
    tool_choice = params.get("tool_choice") or params.get("toolChoice")
    temperature = params.get("temperature")
    top_k = params.get("top_k")
    top_p = params.get("top_p")
    frequency_penalty = params.get("frequency_penalty")
    presence_penalty = params.get("presence_penalty")
    context_message_limit = params.get("context_message_limit") or params.get("contextMessageLimit")
    tool_ids = params.get("tool_ids") or params.get("toolIds") or []
    plan = params.get("plan")
    question = params.get("question") or ""
    research_type = params.get("researchType") or params.get("research_type") or "general"
    concurrent_execution = bool(params.get("concurrentExecution"))
    search_provider = params.get("search_provider") or params.get("searchProvider")
    tavily_api_key = params.get("tavily_api_key") or params.get("tavilyApiKey")

    service = get_stream_chat_service()

    trimmed_messages = (
        messages[-context_message_limit:]
        if isinstance(context_message_limit, int) and context_message_limit > 0
        else messages
    )

    search_tool_id = "Tavily_academic_search" if research_type == "academic" else "Tavily_web_search"
    combined_tool_ids = list({*tool_ids, search_tool_id})
    resolved_tool_choice = tool_choice or ("auto" if tools or combined_tool_ids else None)

    plan_content = plan
    if not plan_content or not str(plan_content).strip():
        if research_type == "academic":
            plan_content = await generate_academic_research_plan(
                provider=provider,
                user_message=question,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )
        else:
            plan_content = await generate_research_plan(
                provider=provider,
                user_message=question,
                api_key=api_key,
                base_url=base_url,
                model=model,
            )

    plan_meta = parse_plan(plan_content)
    steps = plan_meta.get("plan") or []
    sources_map: dict[str, dict[str, Any]] = {}
    findings: list[str] = []

    async def emit_event(event: dict[str, Any]) -> None:
        await event_queue.put(event)

    if concurrent_execution:
        event_queue: asyncio.Queue = asyncio.Queue()
        tasks: list[asyncio.Task] = []

        for i, step in enumerate(steps):
            step_title = step.get("action") or "Research"
            await event_queue.put(
                build_research_step_event(
                    step_index=i,
                    total_steps=len(steps),
                    title=step_title,
                    status="pending",
                )
            )

        async def run_step_task(i: int, step_data: dict[str, Any]) -> str:
            step_title = step_data.get("action") or "Research"
            start = asyncio.get_event_loop().time()
            await emit_event(
                build_research_step_event(
                    step_index=i,
                    total_steps=len(steps),
                    title=step_title,
                    status="running",
                )
            )
            sources_list = build_sources_list(sources_map)
            step_prompt = build_step_prompt(
                plan_meta=plan_meta,
                step=step_data,
                step_index=i,
                prior_findings=findings,
                sources_list=sources_list,
                research_type=research_type,
            )
            step_messages = [
                {"role": "system", "content": step_prompt},
                *trimmed_messages,
                {"role": "user", "content": question},
            ]
            try:
                content = await _run_step(
                    service=service,
                    step_messages=step_messages,
                    provider=provider,
                    api_key=api_key,
                    base_url=base_url,
                    model=model,
                    tools=tools,
                    tool_choice=resolved_tool_choice,
                    tool_ids=combined_tool_ids,
                    response_format=None,
                    thinking=None,
                    temperature=temperature,
                    top_k=top_k,
                    top_p=top_p,
                    frequency_penalty=frequency_penalty,
                    presence_penalty=presence_penalty,
                    context_message_limit=context_message_limit,
                    search_provider=search_provider,
                    tavily_api_key=tavily_api_key,
                    step_index=i,
                    total_steps=len(steps),
                    sources_map=sources_map,
                    emit_event=emit_event,
                )
                await emit_event(
                    build_research_step_event(
                        step_index=i,
                        total_steps=len(steps),
                        title=step_title,
                        status="done",
                        duration_ms=int((asyncio.get_event_loop().time() - start) * 1000),
                    )
                )
                return content
            except Exception as exc:
                await emit_event(
                    build_research_step_event(
                        step_index=i,
                        total_steps=len(steps),
                        title=step_title,
                        status="error",
                        duration_ms=int((asyncio.get_event_loop().time() - start) * 1000),
                        error=exc,
                    )
                )
                return ""

        for i, step in enumerate(steps):
            tasks.append(asyncio.create_task(run_step_task(i, step)))

        pending = set(tasks)
        while pending or not event_queue.empty():
            while not event_queue.empty():
                event = await event_queue.get()
                yield event
            if pending:
                done, pending = await asyncio.wait(pending, timeout=0.05, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    try:
                        content = task.result()
                        if content:
                            findings.append(content)
                    except Exception:
                        pass
        # flush remaining events
        while not event_queue.empty():
            yield await event_queue.get()
    else:
        for i, step in enumerate(steps):
            step_title = step.get("action") or "Research"
            start = asyncio.get_event_loop().time()
            yield build_research_step_event(
                step_index=i,
                total_steps=len(steps),
                title=step_title,
                status="running",
            )
            sources_list = build_sources_list(sources_map)
            step_prompt = build_step_prompt(
                plan_meta=plan_meta,
                step=step,
                step_index=i,
                prior_findings=findings,
                sources_list=sources_list,
                research_type=research_type,
            )
            step_messages = [
                {"role": "system", "content": step_prompt},
                *trimmed_messages,
                {"role": "user", "content": question},
            ]
            try:
                step_queue: asyncio.Queue = asyncio.Queue()

                async def emit_step_event(event: dict[str, Any]) -> None:
                    await step_queue.put(event)

                step_task = asyncio.create_task(
                    _run_step(
                        service=service,
                        step_messages=step_messages,
                        provider=provider,
                        api_key=api_key,
                        base_url=base_url,
                        model=model,
                        tools=tools,
                    tool_choice=resolved_tool_choice,
                        tool_ids=combined_tool_ids,
                        response_format=None,
                        thinking=None,
                        temperature=temperature,
                        top_k=top_k,
                        top_p=top_p,
                        frequency_penalty=frequency_penalty,
                        presence_penalty=presence_penalty,
                        context_message_limit=context_message_limit,
                        search_provider=search_provider,
                        tavily_api_key=tavily_api_key,
                        step_index=i,
                        total_steps=len(steps),
                        sources_map=sources_map,
                        emit_event=emit_step_event,
                    )
                )

                while not step_task.done() or not step_queue.empty():
                    while not step_queue.empty():
                        yield await step_queue.get()
                    if not step_task.done():
                        await asyncio.sleep(0.01)

                content = step_task.result()
                if content:
                    findings.append(content)
                yield build_research_step_event(
                    step_index=i,
                    total_steps=len(steps),
                    title=step_title,
                    status="done",
                    duration_ms=int((asyncio.get_event_loop().time() - start) * 1000),
                )
            except Exception as exc:
                yield build_research_step_event(
                    step_index=i,
                    total_steps=len(steps),
                    title=step_title,
                    status="error",
                    duration_ms=int((asyncio.get_event_loop().time() - start) * 1000),
                    error=exc,
                )

    report_sources_list = build_sources_list(sources_map)
    report_prompt = build_final_report_prompt(
        plan_meta=plan_meta,
        question=question,
        findings=findings,
        sources_list=report_sources_list,
        research_type=research_type,
    )

    report_messages = [
        {"role": "system", "content": report_prompt},
        *trimmed_messages,
        {"role": "user", "content": question},
    ]

    report_request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=report_messages,
        tools=[],
        toolChoice=None,
        toolIds=[],
        responseFormat=None,
        thinking=None,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        stream=True,
    )

    full_content = ""
    async for event in service.stream_chat(report_request):
        if event.get("type") == "text":
            text = event.get("content", "")
            full_content += text
            yield {"type": "text", "content": text}
        elif event.get("type") == "error":
            raise RuntimeError(event.get("error") or "Report generation failed")

    yield {
        "type": "done",
        "content": full_content,
        "sources": list(sources_map.values()) or None,
    }

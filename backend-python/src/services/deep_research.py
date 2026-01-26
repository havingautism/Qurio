"""
Deep research agent service (planner/executor).

This module executes research plans using Agno Workflow for structured,
step-by-step execution with streaming support.
"""

from __future__ import annotations

import ast
import json
from types import SimpleNamespace
from typing import Any, AsyncGenerator
from types import SimpleNamespace
from typing import Any, AsyncGenerator
import uuid
from agno.utils.log import logger

from agno.agent import Agent
from agno.workflow import Workflow
from agno.workflow.parallel import Parallel
from agno.workflow.step import Step, StepInput, StepOutput

from ..models.stream_chat import StreamChatRequest
from ..prompts import (
    GENERAL_FINAL_REPORT_PROMPT,
    ACADEMIC_FINAL_REPORT_PROMPT,
    GENERAL_STEP_AGENT_PROMPT,
    ACADEMIC_STEP_AGENT_PROMPT,
)
from ..services.stream_chat import get_stream_chat_service
from .agent_registry import build_agent, _build_model, _apply_model_settings
from .custom_tools import QurioLocalTools
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
        return ACADEMIC_FINAL_REPORT_PROMPT + base_info

    return GENERAL_FINAL_REPORT_PROMPT + base_info


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


def _create_step_agent(
    *,
    plan_meta: dict[str, Any],
    step: dict[str, Any],
    step_index: int,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str | None,
    tools: list[dict[str, Any]] | None,
    tool_ids: list[str],
    temperature: float | None,
    top_k: float | None,
    top_p: float | None,
    frequency_penalty: float | None,
    presence_penalty: float | None,
    tavily_api_key: str | None,
    research_type: str,
) -> Agent:
    """
    Create an Agent for a research step.

    The agent's instructions include the step-specific context and will
    automatically receive previous step outputs from the Workflow.
    """

    # Build step-specific instructions
    action = step.get("action") or f"Research step {step_index + 1}"
    expected_output = step.get("expected_output") or ""
    deliverable_format = step.get("deliverable_format") or "paragraph"
    acceptance = step.get("acceptance_criteria") or []
    depth = step.get("depth") or "medium"

    # Get assumptions from plan
    assumptions = plan_meta.get("assumptions") or []

    # Build the agent instructions
    if research_type == "academic":
        instructions = f"""You are executing an academic research step with scholarly rigor.

Step {step_index + 1}: {action}

Expected Output: {expected_output}
Deliverable Format: {deliverable_format}
Depth: {depth}

Acceptance Criteria:
{chr(10).join([f"- {a}" for a in acceptance]) if acceptance else "- None"}

Assumptions:
{chr(10).join([f"- {a}" for a in assumptions]) if assumptions else "- None"}

{ACADEMIC_STEP_AGENT_PROMPT}
"""
    else:
        instructions = f"""You are executing a deep research step.

Step {step_index + 1}: {action}

Expected Output: {expected_output}
Deliverable Format: {deliverable_format}
Depth: {depth}

Acceptance Criteria:
{chr(10).join([f"- {a}" for a in acceptance]) if acceptance else "- None"}

Assumptions:
{chr(10).join([f"- {a}" for a in assumptions]) if assumptions else "- None"}

{GENERAL_STEP_AGENT_PROMPT}
"""

    # Create the agent request
    step_request = SimpleNamespace(
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        tavily_api_key=tavily_api_key,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        thinking=None,
        tool_ids=tool_ids,
        tools=tools,
        user_tools=None,
        tool_choice="auto" if (tool_ids or tools) else None,
    )

    # Build and configure the agent
    step_agent = build_agent(step_request)
    step_agent.instructions = instructions

    return step_agent


def build_research_workflow(
    *,
    plan_meta: dict[str, Any],
    question: str,
    provider: str,
    api_key: str,
    base_url: str | None,
    model: str | None,
    tools: list[dict[str, Any]] | None,
    tool_ids: list[str],
    temperature: float | None,
    top_k: float | None,
    top_p: float | None,
    frequency_penalty: float | None,
    presence_penalty: float | None,
    tavily_api_key: str | None,
    research_type: str,
    concurrent_execution: bool = False,
) -> Workflow:
    """
    Build a Workflow from a research plan.

    Each step in the plan becomes a Workflow Step with an Agent.
    Agent events (including tool calls) will automatically propagate to the Workflow.

    Args:
        concurrent_execution: If True, steps that don't require search can run in parallel.
    """
    steps = plan_meta.get("plan") or []
    workflow_steps: list = []

    if concurrent_execution and len(steps) > 1:
        # Parallel execution
        parallel_steps = []
        for step_data in steps:
            step_number = step_data.get("step", len(parallel_steps) + 1)
            step_agent = _create_step_agent(
                plan_meta=plan_meta,
                step=step_data,
                step_index=step_number - 1,
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model=model,
                tools=tools,
                tool_ids=tool_ids,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty,
                tavily_api_key=tavily_api_key,
                research_type=research_type,
            )
            action = step_data.get("action") or f"Research Step {step_number}"
            # Merge step number and action for better display in step cards
            step_name = f"Step {step_number}: {action}"
            parallel_steps.append(
                Step(
                    name=step_name,
                    description=action,
                    agent=step_agent,  # Use agent instead of executor
                )
            )

        # Wrap all steps in a Parallel construct
        parallel = Parallel(
            *parallel_steps,
            name="parallel_research_steps",
            description=f"Parallel execution of {len(parallel_steps)} research steps",
        )
        workflow_steps.append(parallel)
    else:
        # Sequential execution
        for step_data in steps:
            step_number = step_data.get("step", len(workflow_steps) + 1)
            action = step_data.get("action") or f"Research Step {step_number}"
            description = step_data.get("expected_output") or action

            step_agent = _create_step_agent(
                plan_meta=plan_meta,
                step=step_data,
                step_index=step_number - 1,
                provider=provider,
                api_key=api_key,
                base_url=base_url,
                model=model,
                tools=tools,
                tool_ids=tool_ids,
                temperature=temperature,
                top_k=top_k,
                top_p=top_p,
                frequency_penalty=frequency_penalty,
                presence_penalty=presence_penalty,
                tavily_api_key=tavily_api_key,
                research_type=research_type,
            )

            # Merge step number and action for better display in step cards
            step_name = f"Step {step_number}: {action}"

            workflow_step = Step(
                name=step_name,
                description=description,
                agent=step_agent,  # Use agent instead of executor
            )
            workflow_steps.append(workflow_step)

    # Create workflow
    workflow = Workflow(
        name="deep_research",
        description=f"Deep research execution for: {question}",
        steps=workflow_steps,
        stream=True,
        stream_events=True,
        stream_executor_events=True,
    )
    return workflow


async def stream_research_workflow(
    *,
    workflow: Workflow,
    question: str,
    sources_map: dict[str, dict[str, Any]],
    total_steps: int,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Execute a research workflow and yield events.

    This function runs the workflow and converts workflow events
    to the frontend-compatible event format (matching Node.js version).

    Args:
        total_steps: Total number of research steps (required for proper step display)
    """
    import ast
    import time

    # Track tool calls for timing
    # Map internal unique_id -> start_time
    active_tool_calls = {}
    
    # Registry of active steps: step_name -> { number, title, start_time, content }
    active_steps_info = {}
    
    # Scoped Tool ID Mapping: step_name -> { original_id: unique_id }
    step_tool_mappings = {}

    # Current/Latest step info (fallback for sequential or when event lacks step context)
    current_step_context = {"number": None, "title": ""}

    # Run the workflow with streaming
    async for event in workflow.arun(
        input=question,
        stream=True,
        stream_events=True,
        stream_executor_events=True,
    ):
        # Get event type - Agno events use 'event' field
        event_type = event.get("event") if isinstance(event, dict) else getattr(event, "event", None)

        if event_type == "ParallelExecutionStarted":
             logger.info("DEBUG_EVENT: ParallelExecutionStarted")

        elif event_type == "ParallelExecutionCompleted":
             logger.info("DEBUG_EVENT: ParallelExecutionCompleted")

        elif event_type == "StepStarted":
            # Agno SDK uses step_name field (not name or description)
            step_name = getattr(event, "step_name", "")
            step_number = getattr(event, "step_index", None)
            logger.info(f"DEBUG_EVENT: StepStarted name={step_name} number={step_number}")

            if step_number is not None:
                # Register active step
                active_steps_info[step_name] = {
                    "number": step_number + 1,
                    "title": step_name,
                    "start_time": time.time(),
                    "content": [] # Buffer for this step's thinking content
                }
                
                # Update current context default (for sequential fallback)
                current_step_context = {
                    "number": step_number + 1,
                    "title": step_name
                }
            
            # Use data from active_steps if available, else fallback
            step_display_num = active_steps_info.get(step_name, {}).get("number", 1)

            # Yield event in Node.js format
            yield {
                "type": "research_step",
                "step": step_display_num,
                "total": total_steps,
                "title": step_name,
                "status": "running",
            }
        elif event_type == "StepCompleted":
            # Agno SDK uses step_name field (not name or description)
            step_name = getattr(event, "step_name", "")
            step_number = getattr(event, "step_index", None)
            logger.info(f"DEBUG_EVENT: StepCompleted name={step_name} number={step_number}")
            
            # Retrieve step info
            step_info = active_steps_info.get(step_name, {})
            step_num = step_info.get("number", current_step_context["number"] or 1)
            step_title = step_name or current_step_context["title"]
            step_start = step_info.get("start_time")
            step_content_buffer = step_info.get("content", [])

            # Calculate duration
            duration_ms = None
            if step_start is not None:
                duration_ms = int((time.time() - step_start) * 1000)

            # Extract step output for report generation
            step_output = getattr(event, "output", None)
            if step_output:
                output_content = getattr(step_output, "content", "")
            else:
                output_content = getattr(event, "content", "")

            # First, yield any accumulated step content
            for content_chunk in step_content_buffer:
                yield {
                    "type": "step_content",
                    "step": step_num,
                    "content": content_chunk,
                }

            # Yield step done event in Node.js format
            yield {
                "type": "research_step",
                "step": step_num,
                "total": total_steps,
                "title": step_title,
                "status": "done",
                "duration_ms": duration_ms,
            }

            # Also yield step output for report generation
            if output_content:
                yield {
                    "type": "step_output",
                    "step": step_num,
                    "content": output_content,
                }

            # Cleanup step context
            if step_name in active_steps_info:
                del active_steps_info[step_name]
            
            # Global cleanup is minimized, we rely on scoped clear. 
            # active_tool_calls.clear()  <-- Removing this global nuke to support parallel
            # tool_id_mapping.clear()    <-- Removing this global nuke to support parallel
        # Handle Agent run events
        elif event_type == "RunContent":
            # Text content from agent during step execution - this is step thinking content
            content = getattr(event, "content", "")
            if content:
                # Appending content logic:
                # 1. Start Content: Should go to the current RUNNING step.
                # In parallel, multiple steps might be running.
                # We append to the latest active step as a heuristic, or ALL?
                # Usually RunContent comes from the currently executing agent loop.
                # Since we don't have step ID in RunContent, we use `active_steps_info` heuristic:
                if active_steps_info:
                    # Get the most recently added step (python dicts preserve insertion order)
                    latest_step = list(active_steps_info.values())[-1]
                    latest_step["content"].append(content)
                else:
                    pass
        # Handle WorkflowCompleted - this contains the final content
        elif event_type == "WorkflowCompleted":
            # WorkflowCompleted event contains the final output content
            final_content = getattr(event, "content", "")
            yield {
                "type": "workflow_completed",
                "content": final_content,  # Final content from workflow
            }
        elif event_type == "ToolCallStarted":
            # Extract tool info
            tool = getattr(event, "tool", None)
            if tool:
                tool_id = getattr(tool, "tool_call_id", getattr(event, "tool_call_id", getattr(tool, "id", None)))
                tool_name = getattr(tool, "tool_name", "unknown")
                tool_args = getattr(tool, "tool_args", {})
            else:
                # Fallback: try direct fields
                tool_id = getattr(event, "tool_call_id", getattr(event, "id", None))
                tool_name = getattr(event, "tool_name", getattr(event, "name", "unknown"))
                tool_args = getattr(event, "tool_args", getattr(event, "arguments", {}))
            
            # Generate a unique ID to ensure frontend uniqueness and parallel safety
            # Kimi/Agno might reuse IDs like 'Tavily:0' across steps
            original_id = tool_id
            unique_id = f"{tool_name}_{uuid.uuid4().hex[:8]}"
            
            # Identify which step this tool call belongs to
            # 1. Try to get step_name from event directly
            event_step_name = getattr(event, "step_name", None)
            target_step_name = None
            
            if event_step_name and event_step_name in active_steps_info:
                target_step_name = event_step_name
            elif len(active_steps_info) > 0:
                # 2. Fallback: Assumption - if not specified, it belongs to the most recently started active step
                target_step_name = list(active_steps_info.keys())[-1]
            
            # Store mapping in the correct scope
            step_num_for_report = current_step_context["number"] or 1
            if target_step_name:
                if target_step_name not in step_tool_mappings:
                     step_tool_mappings[target_step_name] = {}
                step_tool_mappings[target_step_name][original_id if original_id else "unknown_id"] = unique_id
                step_num_for_report = active_steps_info[target_step_name]["number"]

            logger.info(f"DEBUG_EVENT: ToolCallStarted original_id={original_id} unique_id={unique_id} name={tool_name} step={target_step_name}")

            # Record tool call start time with UNIQUE ID
            active_tool_calls[unique_id] = time.time()

            # Ensure tool_args is properly formatted as JSON string with double quotes
            # If it's already a dict, convert to JSON string with double quotes
            if isinstance(tool_args, dict):
                tool_args_json = json.dumps(tool_args, ensure_ascii=False)
            elif isinstance(tool_args, str):
                # If it's already a string, make sure it's valid JSON
                try:
                    # Try to parse and re-dump to ensure valid JSON
                    parsed = json.loads(tool_args)
                    tool_args_json = json.dumps(parsed, ensure_ascii=False)
                except json.JSONDecodeError:
                    # Not valid JSON - might be Python repr string with single quotes
                    # Try ast.literal_eval to parse Python dict/tuple/set representations
                    try:
                        parsed = ast.literal_eval(tool_args)
                        tool_args_json = json.dumps(parsed, ensure_ascii=False)
                    except (ValueError, SyntaxError):
                        # If all else fails, use as-is
                        tool_args_json = tool_args
            else:
                tool_args_json = {}

            # Yield event in Node.js format with UNIQUE ID and CORRECT STEP
            yield {
                "type": "tool_call",
                "id": unique_id,
                "name": tool_name,
                "arguments": tool_args_json,
                "step": step_num_for_report,
                "total": total_steps,
            }
        elif event_type == "ToolCallCompleted":
            # Extract tool info
            tool = getattr(event, "tool", None)
            if tool:
                tool_id = getattr(tool, "tool_call_id", getattr(event, "tool_call_id", getattr(tool, "id", None)))
                tool_name = getattr(tool, "tool_name", "unknown")
                result = getattr(tool, "result", {})
                tool_error = getattr(tool, "tool_call_error", None)
            else:
                # Fallback: try direct fields
                tool_id = getattr(event, "tool_call_id", getattr(event, "id", None))
                tool_name = getattr(event, "tool_name", getattr(event, "name", "unknown"))
                result = getattr(event, "result", {})
                tool_error = getattr(event, "error", getattr(event, "tool_call_error", None))
            
            # Resolve to unique ID with Scoped Lookup
            original_id = tool_id
            unique_id = None
            found_step_name = None
            
            # 1. Try direct lookup if step name known
            event_step_name = getattr(event, "step_name", None)
            if event_step_name and event_step_name in step_tool_mappings:
                mapping = step_tool_mappings[event_step_name]
                unique_id = mapping.get(original_id if original_id else "unknown_id")
                found_step_name = event_step_name
            else:
                # 2. Search all active/recent mappings (Handle race or missing step info)
                # Prioritize active steps
                for s_name, mapping in reversed(step_tool_mappings.items()):
                     uid = mapping.get(original_id if original_id else "unknown_id")
                     if uid:
                         unique_id = uid
                         found_step_name = s_name
                         break
            
            # Fallback if mapping lost
            if not unique_id:
                unique_id = original_id or f"fallback_{uuid.uuid4().hex[:8]}"

            logger.info(f"DEBUG_EVENT: ToolCallCompleted original_id={original_id} unique_id={unique_id} name={tool_name} error={tool_error} step={found_step_name}")

            # Calculate duration
            duration_ms = None
            if unique_id and unique_id in active_tool_calls:
                duration_ms = int((time.time() - active_tool_calls[unique_id]) * 1000)
                del active_tool_calls[unique_id]
            
            # Specific cleanup from mapping
            if found_step_name and found_step_name in step_tool_mappings:
                 map_key = original_id if original_id else "unknown_id"
                 # Optional: clean up immediately or wait for step end?
                 # Agno reuses IDs in loops? If loop, we shouldn't delete?
                 # Safest for Kimi is to delete to prevent stale lookups, assuming 1 call = 1 event pair.
                 if map_key in step_tool_mappings[found_step_name]:
                     del step_tool_mappings[found_step_name][map_key]
            
            # Determine correct step number
            step_num_for_report = active_steps_info.get(found_step_name, {}).get("number", current_step_context["number"] or 1)

            # Parse result to dict for source extraction
            result_dict = None
            if isinstance(result, str):
                try:
                    result_dict = json.loads(result)
                except json.JSONDecodeError:
                    try:
                        result_dict = ast.literal_eval(result)
                    except (ValueError, SyntaxError):
                        result_dict = None
            elif isinstance(result, dict):
                result_dict = result

            # Extract sources from result (search tools return "results" with "url" field)
            # Also support "sources" format if provided by other tools
            results_list = result_dict.get("results") if result_dict else None
            sources_list = result_dict.get("sources") if result_dict else None

            if results_list and isinstance(results_list, list):
                for source in results_list:
                    url = source.get("url") or source.get("uri")
                    if url:
                        sources_map[url] = source
            elif sources_list and isinstance(sources_list, list):
                for source in sources_list:
                    uri = source.get("uri")
                    if uri:
                        sources_map[uri] = source

            # Determine status
            status = "error" if tool_error else "done"

            # Ensure result is properly formatted as JSON string for output field
            output_value = None
            if result and not tool_error:
                # Handle case where result is already a string
                if isinstance(result, str):
                    try:
                        # Try to parse as JSON first (双引号 JSON)
                        parsed = json.loads(result)
                        output_value = json.dumps(parsed, ensure_ascii=False)
                    except json.JSONDecodeError:
                        try:
                            # Try to parse as Python repr string (单引号)
                            parsed = ast.literal_eval(result)
                            output_value = json.dumps(parsed, ensure_ascii=False)
                        except (ValueError, SyntaxError):
                            # If all else fails, wrap as string value
                            output_value = json.dumps({"output": result}, ensure_ascii=False)
                elif isinstance(result, dict):
                    output_value = json.dumps(result, ensure_ascii=False)
                else:
                    output_value = json.dumps(result, ensure_ascii=False)

            # Yield event in Node.js format with UNIQUE ID
            yield {
                "type": "tool_result",
                "id": unique_id,
                "name": tool_name,
                "status": status,
                "duration_ms": duration_ms,
                "output": output_value,
                "error": str(tool_error) if tool_error else None,
                "step": step_num_for_report,
                "total": total_steps,
            }

    # After workflow completes, return the final output
    yield {"type": "workflow_completed"}


async def stream_deep_research(params: dict[str, Any]) -> AsyncGenerator[dict[str, Any], None]:
    provider = params.get("provider")
    api_key = params.get("api_key") or params.get("apiKey")
    base_url = params.get("base_url") or params.get("baseUrl")
    model = params.get("model")
    messages = params.get("messages") or []
    tools = params.get("tools") or []
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
    search_provider = params.get("search_provider") or params.get("searchProvider")
    tavily_api_key = params.get("tavily_api_key") or params.get("tavilyApiKey")
    concurrent_execution = params.get("concurrentExecution") or params.get("concurrent_execution") or False

    service = get_stream_chat_service()

    trimmed_messages = (
        messages[-context_message_limit:]
        if isinstance(context_message_limit, int) and context_message_limit > 0
        else messages
    )

    search_tool_id = "Tavily_academic_search" if research_type == "academic" else "Tavily_web_search"
    combined_tool_ids = list({*tool_ids, search_tool_id})

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
    sources_map: dict[str, dict[str, Any]] = {}

    # Build and execute workflow
    workflow = build_research_workflow(
        plan_meta=plan_meta,
        question=question,
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        tools=tools,
        tool_ids=combined_tool_ids,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        tavily_api_key=tavily_api_key,
        research_type=research_type,
        concurrent_execution=concurrent_execution,
    )

    # Execute workflow and collect findings
    step_outputs = []  # Collect all step outputs for report generation
    step_completed_count = 0
    total_steps = len(plan_meta.get('plan', []))

    async for event in stream_research_workflow(
        workflow=workflow,
        question=question,
        sources_map=sources_map,
        total_steps=total_steps,
    ):
        event_type = event.get("type")

        # Track step completion and collect outputs
        if event_type == "research_step" and event.get("status") == "done":
            step_completed_count += 1
            # Also forward the done event to frontend
            yield event
        elif event_type == "step_output":
            # Collect step output for final report
            output_content = event.get("content", "")
            step_num = event.get("step", 999) # Default to high number if missing
            if output_content:
                # Store dict of (step_num, content) to sort later
                step_outputs.append({"step": step_num, "content": output_content})
        elif event_type == "workflow_completed":
            # Workflow completed - we don't need this anymore since we collected step outputs
            break
        else:
            # Yield all other events (tool_call, tool_result, research_step running, etc.)
            yield event

    # Generate final report using all step outputs as findings
    report_sources_list = build_sources_list(sources_map)

    # Sort outputs by step number to ensure logical order (critical for parallel execution)
    step_outputs.sort(key=lambda x: x["step"])
    sorted_contents = [x["content"] for x in step_outputs]

    # Use step_outputs as findings for comprehensive report generation
    findings_for_report = sorted_contents if sorted_contents else ["No step outputs available"]

    report_prompt = build_final_report_prompt(
        plan_meta=plan_meta,
        question=question,
        findings=findings_for_report,
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

    # Stream report generation and collect report content
    report_content = ""
    async for event in service.stream_chat(report_request):
        if event.get("type") == "text":
            content = event.get("content", "")
            report_content += content
            yield {"type": "text", "content": content}
        elif event.get("type") == "error":
            raise RuntimeError(event.get("error") or "Report generation failed")

    # Send done event with the actual report content (not workflow output)
    yield {
        "type": "done",
        "content": report_content,  # Use report_content instead of full_content
        "sources": list(sources_map.values()) or None,
    }


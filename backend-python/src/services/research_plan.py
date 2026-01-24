"""
Research plan generation services using Agno ReasoningTools.

This module replaces the original prompt-based plan generation with an
agent-based approach using ReasoningTools for transparent, structured planning.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, AsyncGenerator

from agno.agent import Agent
from agno.tools.reasoning import ReasoningTools

from ..prompts import GENERAL_PLANNER_PROMPT, ACADEMIC_PLANNER_PROMPT
from .agent_registry import _build_model, _apply_model_settings


async def generate_research_plan(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    top_k: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    thinking: Any = None,
) -> str:
    """
    Generate a research plan using Agent with ReasoningTools.

    This replaces the original prompt-based approach with an agent that uses
    think() and analyze() tools for transparent, structured planning.
    """
    # Build model using the same approach as agent_registry
    plan_model = _build_model(provider, api_key, base_url, model)

    # Apply model settings (temperature, top_p, etc.)
    request = SimpleNamespace(
        provider=provider,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        thinking=thinking,
    )
    _apply_model_settings(plan_model, request)

    # Create planner agent with ReasoningTools
    planner = Agent(
        model=plan_model,
        tools=[ReasoningTools(
            add_instructions=True,
            enable_think=True,
            enable_analyze=True
        )],
        instructions=GENERAL_PLANNER_PROMPT
    )

    # Run the planner
    response = await planner.arun(user_message)

    # Extract content and format as JSON string (for backward compatibility)
    if hasattr(response, 'content'):
        plan_text = response.content
    else:
        plan_text = str(response)

    plan_text = plan_text.strip()

    # Remove markdown code blocks if present
    if plan_text.startswith("```"):
        parts = plan_text.split("```")
        if len(parts) >= 2:
            plan_text = parts[1]
            if plan_text.startswith("json"):
                plan_text = plan_text[4:]
            plan_text = plan_text.rstrip("`").strip()

    # Validate it's valid JSON
    try:
        plan = json.loads(plan_text)
        return json.dumps(plan, ensure_ascii=True, indent=2)
    except json.JSONDecodeError:
        return plan_text


async def generate_academic_research_plan(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    top_k: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    thinking: Any = None,
) -> str:
    """
    Generate an academic research plan using Agent with ReasoningTools.
    """
    # Build model using the same approach as agent_registry
    plan_model = _build_model(provider, api_key, base_url, model)

    # Apply model settings
    request = SimpleNamespace(
        provider=provider,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        thinking=thinking,
    )
    _apply_model_settings(plan_model, request)

    # Create academic planner agent with ReasoningTools
    planner = Agent(
        model=plan_model,
        tools=[ReasoningTools(
            add_instructions=True,
            enable_think=True,
            enable_analyze=True
        )],
        instructions=ACADEMIC_PLANNER_PROMPT
    )

    # Run the planner with the user message
    response = await planner.arun(user_message)

    # Extract content and format as JSON string
    if hasattr(response, 'content'):
        plan_text = response.content
    else:
        plan_text = str(response)

    plan_text = plan_text.strip()

    # Remove markdown code blocks if present
    if plan_text.startswith("```"):
        parts = plan_text.split("```")
        if len(parts) >= 2:
            plan_text = parts[1]
            if plan_text.startswith("json"):
                plan_text = plan_text[4:]
            plan_text = plan_text.rstrip("`").strip()

    # Validate and format
    try:
        plan = json.loads(plan_text)
        return json.dumps(plan, ensure_ascii=True, indent=2)
    except json.JSONDecodeError:
        return plan_text


async def stream_generate_research_plan(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    top_k: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    thinking: Any = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Stream research plan generation using Agent with ReasoningTools.

    This is the streaming version of generate_research_plan that yields
    events as the agent plans using think() and analyze() tools.
    """
    # Build model using the same approach as agent_registry
    plan_model = _build_model(provider, api_key, base_url, model)

    # Apply model settings (temperature, top_p, etc.)
    request = SimpleNamespace(
        provider=provider,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        thinking=thinking,
    )
    _apply_model_settings(plan_model, request)

    # Create planner agent with ReasoningTools
    planner = Agent(
        model=plan_model,
        tools=[ReasoningTools(
            add_instructions=True,
            enable_think=True,
            enable_analyze=True
        )],
        instructions=GENERAL_PLANNER_PROMPT
    )

    # Stream the planner execution
    full_content = ""
    async for chunk in planner.arun(user_message, stream=True):
        chunk_text = ""
        if hasattr(chunk, "content"):
            chunk_text = chunk.content or ""
        elif isinstance(chunk, str):
            chunk_text = chunk
        else:
            chunk_text = str(chunk)

        if chunk_text:
            full_content += chunk_text
            yield {"type": "text", "content": chunk_text}

    # Clean and finalize the plan
    plan_text = full_content.strip()

    # Remove markdown code blocks if present
    if plan_text.startswith("```"):
        parts = plan_text.split("```")
        if len(parts) >= 2:
            plan_text = parts[1]
            if plan_text.startswith("json"):
                plan_text = plan_text[4:]
            plan_text = plan_text.rstrip("`").strip()

    # Validate and format
    try:
        plan = json.loads(plan_text)
        final_plan = json.dumps(plan, ensure_ascii=True, indent=2)
        yield {"type": "done", "content": final_plan}
    except json.JSONDecodeError:
        yield {"type": "done", "content": plan_text}


async def stream_generate_academic_research_plan(
    *,
    provider: str,
    user_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    top_p: float | None = None,
    top_k: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    thinking: Any = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Stream academic research plan generation using Agent with ReasoningTools.

    This is the streaming version of generate_academic_research_plan that yields
    events as the agent plans using think() and analyze() tools.
    """
    # Build model using the same approach as agent_registry
    plan_model = _build_model(provider, api_key, base_url, model)

    # Apply model settings
    request = SimpleNamespace(
        provider=provider,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        thinking=thinking,
    )
    _apply_model_settings(plan_model, request)

    # Create academic planner agent with ReasoningTools
    planner = Agent(
        model=plan_model,
        tools=[ReasoningTools(
            add_instructions=True,
            enable_think=True,
            enable_analyze=True
        )],
        instructions=ACADEMIC_PLANNER_PROMPT
    )

    # Stream the planner execution
    full_content = ""
    async for chunk in planner.arun(user_message, stream=True):
        chunk_text = ""
        if hasattr(chunk, "content"):
            chunk_text = chunk.content or ""
        elif isinstance(chunk, str):
            chunk_text = chunk
        else:
            chunk_text = str(chunk)

        if chunk_text:
            full_content += chunk_text
            yield {"type": "text", "content": chunk_text}

    # Clean and finalize the plan
    plan_text = full_content.strip()

    # Remove markdown code blocks if present
    if plan_text.startswith("```"):
        parts = plan_text.split("```")
        if len(parts) >= 2:
            plan_text = parts[1]
            if plan_text.startswith("json"):
                plan_text = plan_text[4:]
            plan_text = plan_text.rstrip("`").strip()

    # Validate and format
    try:
        plan = json.loads(plan_text)
        final_plan = json.dumps(plan, ensure_ascii=True, indent=2)
        yield {"type": "done", "content": final_plan}
    except json.JSONDecodeError:
        yield {"type": "done", "content": plan_text}

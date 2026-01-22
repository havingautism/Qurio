"""
Simple generation services (title, daily tip, related questions, agent selection).
"""

from __future__ import annotations

from typing import Any

from ..models.stream_chat import StreamChatRequest
from .llm_utils import run_agent_completion, safe_json_parse


async def generate_daily_tip(
    *,
    provider: str,
    language: str | None,
    category: str | None,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_ids: list[str] | None = None,
    user_tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    search_provider: str | None = None,
    tavily_api_key: str | None = None,
) -> str:
    language_block = f"\n\n## Language\nReply in {language}." if language else ""
    category_block = f"\n\n## Category\n{category}" if category else ""
    messages = [
        {
            "role": "system",
            "content": (
                "## Task\n"
                "Generate a short, practical tip for today. Keep it to 1-2 sentences and avoid emojis."
                f"{category_block}{language_block}\n\n"
                "## Output\n"
                "Return only the tip text."
            ),
        },
        {"role": "user", "content": "Daily tip."},
    ]

    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids or [],
        userTools=user_tools or [],
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
    result = await run_agent_completion(request)
    return (result.get("content") or "").strip()


async def generate_title(
    *,
    provider: str,
    first_message: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_ids: list[str] | None = None,
    user_tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    search_provider: str | None = None,
    tavily_api_key: str | None = None,
) -> dict[str, Any]:
    messages = [
        {
            "role": "system",
            "content": (
                "## Task\n"
                "Generate a short, concise title (max 5 words) for this conversation based on the user's first message. "
                "Do not use quotes.\n"
                "Select 1 emoji that best matches the conversation.\n\n"
                "## Output\n"
                'Return JSON with keys "title" and "emojis". '
                '"emojis" must be an array with 1 emoji character.'
            ),
        },
        {"role": "user", "content": first_message},
    ]
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids or [],
        userTools=user_tools or [],
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
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    parsed = safe_json_parse(content) or {}
    title = parsed.get("title") or content or "New Conversation"
    emojis = parsed.get("emojis") if isinstance(parsed, dict) else None
    if not isinstance(emojis, list):
        emojis = []
    emojis = [str(item).strip() for item in emojis if str(item).strip()][:1]
    return {"title": title, "emojis": emojis}


async def generate_title_and_space(
    *,
    provider: str,
    first_message: str,
    spaces: list[dict[str, Any]],
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_ids: list[str] | None = None,
    user_tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    search_provider: str | None = None,
    tavily_api_key: str | None = None,
) -> dict[str, Any]:
    space_labels = ", ".join([str(s.get("label", "")).strip() for s in spaces or []]).strip()
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant.\n"
                "## Task\n"
                "1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.\n"
                f"2. Select the most appropriate space from the following list: [{space_labels}]. "
                "If none fit well, return null.\n"
                "3. Select 1 emoji that best matches the conversation.\n\n"
                "## Output\n"
                'Return the result as a JSON object with keys "title", "spaceLabel", and "emojis".'
            ),
        },
        {"role": "user", "content": first_message},
    ]
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids or [],
        userTools=user_tools or [],
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
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    parsed = safe_json_parse(content) or {}
    title = parsed.get("title") or content or "New Conversation"
    space_label = parsed.get("spaceLabel")
    selected_space = next((s for s in spaces if s.get("label") == space_label), None)
    emojis = parsed.get("emojis") if isinstance(parsed, dict) else None
    if not isinstance(emojis, list):
        emojis = []
    emojis = [str(item).strip() for item in emojis if str(item).strip()][:1]
    return {"title": title, "space": selected_space, "emojis": emojis}


def _sanitize_option_text(text: Any) -> str:
    return (
        str(text or "")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("{", "")
        .replace("}", "")
        .split()
    )


async def generate_title_space_and_agent(
    *,
    provider: str,
    first_message: str,
    spaces_with_agents: list[dict[str, Any]],
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_ids: list[str] | None = None,
    user_tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    search_provider: str | None = None,
    tavily_api_key: str | None = None,
) -> dict[str, Any]:
    space_lines = []
    for space in spaces_with_agents or []:
        agent_entries = []
        for agent in space.get("agents") or []:
            if isinstance(agent, str):
                agent_entries.append({"name": agent})
            else:
                agent_entries.append(
                    {"name": agent.get("name", ""), "description": agent.get("description", "")}
                )
        agent_tokens = []
        for agent in agent_entries:
            name = " ".join(_sanitize_option_text(agent.get("name")))
            description = " ".join(_sanitize_option_text(agent.get("description")))
            if name and description:
                agent_tokens.append(f"{name} - {description}")
            elif name:
                agent_tokens.append(name)
        space_label = " ".join(_sanitize_option_text(space.get("label")))
        space_description = " ".join(_sanitize_option_text(space.get("description")))
        space_token = f"{space_label} - {space_description}" if space_description else space_label
        space_lines.append(f"{space_token}:{{{','.join(agent_tokens)}}}")

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant.\n"
                "## Task\n"
                "1. Generate a short, concise title (max 5 words) for this conversation based on the user's first message.\n"
                "2. Select the most appropriate space from the list below and return its spaceLabel.\n"
                "3. If the chosen space has agents, select the best matching agent by agentName. Otherwise return null.\n"
                "4. Select 1 emoji that best matches the conversation.\n\n"
                "## Output\n"
                'Return the result as JSON with keys "title", "spaceLabel", "agentName", and "emojis". '
                '"emojis" must be an array with 1 emoji character.'
            ),
        },
        {
            "role": "user",
            "content": f"{first_message}\n\nSpaces and agents:\n" + "\n".join(space_lines),
        },
    ]
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids or [],
        userTools=user_tools or [],
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
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    parsed = safe_json_parse(content) or {}
    emojis = parsed.get("emojis") if isinstance(parsed, dict) else None
    if not isinstance(emojis, list):
        emojis = []
    emojis = [str(item).strip() for item in emojis if str(item).strip()][:1]
    return {
        "title": parsed.get("title") or content or "New Conversation",
        "spaceLabel": parsed.get("spaceLabel") or None,
        "agentName": parsed.get("agentName") or None,
        "emojis": emojis,
    }


async def generate_agent_for_auto(
    *,
    provider: str,
    user_message: str,
    current_space: dict[str, Any] | None,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_ids: list[str] | None = None,
    user_tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    search_provider: str | None = None,
    tavily_api_key: str | None = None,
) -> str | None:
    agent_entries = []
    for agent in (current_space or {}).get("agents") or []:
        if isinstance(agent, str):
            agent_entries.append({"name": agent})
        else:
            agent_entries.append(
                {"name": agent.get("name", ""), "description": agent.get("description", "")}
            )
    agent_tokens = []
    for agent in agent_entries:
        name = " ".join(_sanitize_option_text(agent.get("name")))
        description = " ".join(_sanitize_option_text(agent.get("description")))
        if name and description:
            agent_tokens.append(f"{name} - {description}")
        elif name:
            agent_tokens.append(name)

    space_label = (current_space or {}).get("label") or "Default"
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant.\n"
                f"## Task\nSelect the best matching agent for the user's message from the \"{space_label}\" space. "
                "Consider the agent's name and description to determine which one is most appropriate. "
                "If no agent is a good match, return null.\n\n"
                "## Output\nReturn the result as JSON with key \"agentName\" (agent name only, or null)."
            ),
        },
        {
            "role": "user",
            "content": f"{user_message}\n\nAvailable agents in {space_label}:\n" + "\n".join(agent_tokens),
        },
    ]
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids or [],
        userTools=user_tools or [],
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
    result = await run_agent_completion(request)
    parsed = safe_json_parse(result.get("content", "")) or {}
    return parsed.get("agentName") or None


def _normalize_related_questions(parsed: Any) -> list[str]:
    if isinstance(parsed, list):
        return [q for q in parsed if isinstance(q, str) and q.strip()]
    if isinstance(parsed, dict):
        if isinstance(parsed.get("questions"), list):
            return [q for q in parsed["questions"] if isinstance(q, str) and q.strip()]
        if isinstance(parsed.get("related_questions"), list):
            return [q for q in parsed["related_questions"] if isinstance(q, str) and q.strip()]
    return []


async def generate_related_questions(
    *,
    provider: str,
    messages: list[dict[str, Any]],
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    tool_ids: list[str] | None = None,
    user_tools: list[dict[str, Any]] | None = None,
    tool_choice: Any = None,
    response_format: dict[str, Any] | None = None,
    thinking: dict[str, Any] | bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    frequency_penalty: float | None = None,
    presence_penalty: float | None = None,
    context_message_limit: int | None = None,
    search_provider: str | None = None,
    tavily_api_key: str | None = None,
) -> list[str]:
    prompt_messages = [
        *(messages or []),
        {
            "role": "user",
            "content": (
                "Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. "
                "Return them as a JSON array of strings. Example: "
                '["Question 1?", "Question 2?"]'
            ),
        },
    ]
    response_format = {"type": "json_object"} if provider != "gemini" else None
    request = StreamChatRequest(
        provider=provider,
        apiKey=api_key,
        baseUrl=base_url,
        model=model,
        messages=prompt_messages,
        tools=tools or [],
        toolChoice=tool_choice,
        toolIds=tool_ids or [],
        userTools=user_tools or [],
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
    result = await run_agent_completion(request)
    parsed = safe_json_parse(result.get("content", ""))
    return _normalize_related_questions(parsed)

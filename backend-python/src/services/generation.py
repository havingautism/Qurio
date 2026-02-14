"""
Simple generation services (title, daily tip, related questions, agent selection).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from ..models.generation import (
    AgentNameResponse,
    DailyTipResponse,
    RelatedQuestionsResponse,
    SpaceAgentResponse,
    TitleResponse,
    TitleSpaceAgentResponse,
    TitleSpaceResponse,
)
from ..models.stream_chat import StreamChatRequest
from .llm_utils import run_agent_completion, safe_json_parse


def _get_output_value(output_obj: Any, *keys: str) -> Any:
    if not output_obj:
        return None
    if isinstance(output_obj, dict):
        for key in keys:
            if key in output_obj:
                return output_obj.get(key)
        return None
    for key in keys:
        if hasattr(output_obj, key):
            return getattr(output_obj, key)
    return None


def _build_time_context(user_timezone: str | None, user_locale: str | None) -> str:
    timezone = user_timezone or "UTC"
    locale = user_locale or "en-US"
    try:
        tzinfo = ZoneInfo(timezone)
        now = datetime.now(tzinfo)
    except Exception:
        timezone = "UTC"
        now = datetime.utcnow()
    formatted = now.strftime("%Y-%m-%d %H:%M:%S")
    return (
        "\n\n<today_local_time>\n"
        f"##today local time: {formatted} ({timezone})\n"
        f"locale: {locale}\n"
        f"iso: {now.isoformat()}\n"
        "</today_local_time>"
    )


def _append_time_context(
    messages: list[dict[str, Any]],
    user_timezone: str | None,
    user_locale: str | None,
    reference_text: str | None = None,
) -> list[dict[str, Any]]:
    time_context = _build_time_context(user_timezone, user_locale)
    if not messages:
        return [{"role": "system", "content": time_context.strip()}]
    updated = list(messages)
    system_index = next((i for i, m in enumerate(updated) if m.get("role") == "system"), -1)
    if system_index != -1:
        updated[system_index] = {
            **updated[system_index],
            "content": f"{updated[system_index].get('content', '')}{time_context}",
        }
    else:
        updated.insert(0, {"role": "system", "content": time_context.strip()})
    return updated


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
    user_timezone: str | None = None,
    user_locale: str | None = None,
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
    messages = _append_time_context(messages, user_timezone, user_locale, "daily tip")

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
        output_schema=DailyTipResponse,
        thinking=thinking,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        skipDefaultTools=True,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    thought = result.get("thought", "").strip()
    output_obj = result.get("output")

    tip = None
    if output_obj:
        tip = _get_output_value(output_obj, "tip")

    if not tip:
        parsed = safe_json_parse(content)
        if isinstance(parsed, dict):
            tip = parsed.get("tip")
    if not tip and thought:
        parsed = safe_json_parse(thought)
        if isinstance(parsed, dict):
            tip = parsed.get("tip")
    if not tip:
        tip = content # Fallback for plain text

    # Cleanup if model included "tip='...'"
    if tip and isinstance(tip, str) and tip.startswith("tip="):
        import re
        match = re.search(r"tip=['\"](.*?)['\"]", tip)
        if match:
            tip = match.group(1)

    return (tip or content or "").strip()


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
    user_timezone: str | None = None,
    user_locale: str | None = None,
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
    messages = _append_time_context(messages, user_timezone, user_locale, first_message)
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
        output_schema=TitleResponse,
        thinking=thinking,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        skipDefaultTools=True,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    thought = result.get("thought", "").strip()

    # Try structured output first
    output_obj = result.get("output")
    title = None
    emojis = []

    if output_obj:
        title = _get_output_value(output_obj, "title")
        emojis = _get_output_value(output_obj, "emojis") or []
    if not title:
        # Fallback to manual parsing
        parsed = safe_json_parse(content) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")
            emojis = parsed.get("emojis")
    if not title and thought:
        parsed = safe_json_parse(thought) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")
            emojis = emojis or parsed.get("emojis")

    # Robust cleanup for models like GLM
    if (not title or title.strip().startswith("title=")) and content:
        import re
        m_title = re.search(r"title=['\"](.*?)['\"]", content, flags=re.DOTALL)
        if m_title:
            title = m_title.group(1)

        if not emojis:
            m_emojis = re.search(r"emojis=\[[\"']?(.*?)[\"']?\]", content)
            if m_emojis:
                emojis = [m_emojis.group(1)]

    # Final normalization
    title = title or content or "New Conversation"
    if not isinstance(emojis, list):
        emojis = []
    emojis = [str(item).strip().strip("'").strip('"') for item in emojis if str(item).strip()][:1]

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
    user_timezone: str | None = None,
    user_locale: str | None = None,
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
    messages = _append_time_context(messages, user_timezone, user_locale, first_message)
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
        output_schema=TitleSpaceResponse,
        thinking=thinking,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        skipDefaultTools=True,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()

    # Try structured output first
    output_obj = result.get("output")

    title = None
    space_label = None
    emojis = []

    # If it's a dict or model, extract directly
    if output_obj:
        title = _get_output_value(output_obj, "title")
        space_label = _get_output_value(output_obj, "space_label", "spaceLabel")
        emojis = _get_output_value(output_obj, "emojis") or []

    # If above failed, fallback to manual parsing of content
    if not title:
        parsed = safe_json_parse(content) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")
            space_label = space_label or parsed.get("spaceLabel") or parsed.get("space_label")
            emojis = emojis or parsed.get("emojis")
    if not title and thought:
        parsed = safe_json_parse(thought) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")
            space_label = space_label or parsed.get("spaceLabel") or parsed.get("space_label")
            emojis = emojis or parsed.get("emojis")

    # Robust cleanup for models like GLM (even if parsing failed partially)
    if (not title or (isinstance(title, str) and title.strip().startswith("title="))) and content:
        import re
        m_title = re.search(r"title=['\"](.*?)['\"]", content, flags=re.DOTALL)
        if m_title:
            title = m_title.group(1)

        if not emojis:
            m_emojis = re.search(r"emojis=\[[\"']?(.*?)[\"']?\]", content)
            if m_emojis:
                emojis = [m_emojis.group(1)]

        if not space_label:
            m_space = re.search(r"space_?label=['\"](.*?)['\"]", content, re.IGNORECASE) or re.search(r"space=['\"](.*?)['\"]", content, re.IGNORECASE)
            if m_space:
                space_label = m_space.group(1)

    # Normalize values
    title = str(title or content or "New Conversation")

    # IMPROVED matching: Case-insensitive and trimmed
    search_label = str(space_label or "").strip().lower()
    selected_space = next(
        (s for s in spaces if s.get("label", "").strip().lower() == search_label),
        None
    )

    if not isinstance(emojis, list):
        emojis = []
    emojis = [str(item).strip().strip("'").strip('"') for item in emojis if str(item).strip()][:1]

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
    user_timezone: str | None = None,
    user_locale: str | None = None,
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
    messages = _append_time_context(messages, user_timezone, user_locale, first_message)
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
        output_schema=TitleSpaceAgentResponse,
        thinking=thinking,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        skipDefaultTools=True,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    thought = result.get("thought", "").strip()

    # Try structured output first
    output_obj = result.get("output")
    title = None
    space_label = None
    agent_name = None
    emojis = []

    # If it's a dict or model, extract directly
    if output_obj:
        title = _get_output_value(output_obj, "title")
        space_label = _get_output_value(output_obj, "space_label", "spaceLabel")
        agent_name = _get_output_value(output_obj, "agent_name", "agentName")
        emojis = _get_output_value(output_obj, "emojis") or []

    # Fallback to manual parsing of content
    if not title:
        parsed = safe_json_parse(content) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")
            space_label = space_label or parsed.get("spaceLabel") or parsed.get("space_label")
            agent_name = agent_name or parsed.get("agentName") or parsed.get("agent_name")
            emojis = emojis or parsed.get("emojis")
    if not title and thought:
        parsed = safe_json_parse(thought) or {}
        if isinstance(parsed, dict):
            title = parsed.get("title")
            space_label = space_label or parsed.get("spaceLabel") or parsed.get("space_label")
            agent_name = agent_name or parsed.get("agentName") or parsed.get("agent_name")
            emojis = emojis or parsed.get("emojis")

    # Robust cleanup for models like GLM
    if (not title or (isinstance(title, str) and title.strip().startswith("title="))) and content:
        import re
        m_title = re.search(r"title=['\"](.*?)['\"]", content, flags=re.DOTALL)
        if m_title:
            title = m_title.group(1)

        if not emojis:
            m_emojis = re.search(r"emojis=\[[\"']?(.*?)[\"']?\]", content)
            if m_emojis:
                emojis = [m_emojis.group(1)]

        if not space_label:
            m_space = re.search(r"space_?label=['\"](.*?)['\"]", content, re.IGNORECASE) or re.search(r"space=['\"](.*?)['\"]", content, re.IGNORECASE)
            if m_space:
                space_label = m_space.group(1)

        if not agent_name:
            m_agent = re.search(r"agent_?name=['\"](.*?)['\"]", content, re.IGNORECASE) or re.search(r"agent=['\"](.*?)['\"]", content, re.IGNORECASE)
            if m_agent:
                agent_name = m_agent.group(1)

    # Normalize values
    title = str(title or content or "New Conversation")

    # Strip descriptions if model included them (e.g. "Coding - Help" -> "Coding")
    if space_label and " - " in space_label:
        space_label = space_label.split(" - ")[0].strip()
    if agent_name and " - " in agent_name:
        agent_name = agent_name.split(" - ")[0].strip()

    if not isinstance(emojis, list):
        emojis = []
    emojis = [str(item).strip().strip("'").strip('"') for item in emojis if str(item).strip()][:1]

    return {
        "title": title,
        "spaceLabel": space_label,
        "agentName": agent_name,
        "emojis": emojis,
    }


async def generate_space_and_agent(
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
    user_timezone: str | None = None,
    user_locale: str | None = None,
) -> dict[str, Any]:
    space_lines: list[str] = []
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
                "1. Select the most appropriate space from the list below and return its spaceLabel.\n"
                "2. If the chosen space has agents, select the best matching agent by agentName. Otherwise return null.\n\n"
                "## Output\n"
                'Return the result as JSON with keys "spaceLabel" and "agentName".'
            ),
        },
        {
            "role": "user",
            "content": f"{first_message}\n\nSpaces and agents:\n" + "\n".join(space_lines),
        },
    ]
    messages = _append_time_context(messages, user_timezone, user_locale, first_message)
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
        skipDefaultTools=True,
        stream=True,
        output_schema=SpaceAgentResponse,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    thought = result.get("thought", "").strip()
    thought = result.get("thought", "").strip()

    output_obj = result.get("output")
    space_label = None
    agent_name = None
    if output_obj:
        space_label = _get_output_value(output_obj, "space_label", "spaceLabel")
        agent_name = _get_output_value(output_obj, "agent_name", "agentName")

    if not space_label:
        parsed = safe_json_parse(content) or {}
        if isinstance(parsed, dict):
            space_label = parsed.get("spaceLabel") or parsed.get("space_label")
            agent_name = agent_name or parsed.get("agentName") or parsed.get("agent_name")
    if not space_label and thought:
        parsed = safe_json_parse(thought) or {}
        if isinstance(parsed, dict):
            space_label = parsed.get("spaceLabel") or parsed.get("space_label")
            agent_name = agent_name or parsed.get("agentName") or parsed.get("agent_name")

    if space_label and " - " in str(space_label):
        space_label = str(space_label).split(" - ")[0].strip()
    if agent_name and " - " in str(agent_name):
        agent_name = str(agent_name).split(" - ")[0].strip()

    return {
        "spaceLabel": space_label,
        "agentName": agent_name,
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
    user_timezone: str | None = None,
    user_locale: str | None = None,
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
    messages = _append_time_context(messages, user_timezone, user_locale, user_message)
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
        skipDefaultTools=True,
        stream=True,
        output_schema=AgentNameResponse,
    )
    result = await run_agent_completion(request)
    output_obj = result.get("output")
    if output_obj:
        selected_agent = _get_output_value(output_obj, "agentName", "agent_name")
        if selected_agent:
            return selected_agent

    parsed = safe_json_parse(result.get("content", "")) or {}
    if isinstance(parsed, dict):
        return parsed.get("agentName") or parsed.get("agent_name") or None

    thought_parsed = safe_json_parse(result.get("thought", "")) or {}
    if isinstance(thought_parsed, dict):
        return thought_parsed.get("agentName") or thought_parsed.get("agent_name") or None
    return None


def _normalize_related_questions(parsed: Any) -> list[str]:
    def _sanitize_related_question_text(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        cleaned = " ".join(value.split()).strip()
        if not cleaned:
            return ""
        lowered = cleaned.lower()
        if (
            "<|tool_" in lowered
            or "tool_calls_section" in lowered
            or "tool_call_begin" in lowered
            or "tool_call_end" in lowered
            or "endgroup" in lowered
        ):
            return ""
        if cleaned in {"{", "}", "[", "]"}:
            return ""
        if len(cleaned) > 240:
            return ""
        return cleaned

    def _normalize_list(items: list[Any]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for item in items or []:
            normalized = _sanitize_related_question_text(item)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            out.append(normalized)
            if len(out) >= 3:
                break
        return out

    if isinstance(parsed, list):
        return _normalize_list(parsed)
    if isinstance(parsed, dict):
        if isinstance(parsed.get("questions"), list):
            return _normalize_list(parsed["questions"])
        if isinstance(parsed.get("related_questions"), list):
            return _normalize_list(parsed["related_questions"])
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
    user_timezone: str | None = None,
    user_locale: str | None = None,
) -> list[str]:
    prompt_messages = [
        *(messages or []),
        {
            "role": "user",
            "content": (
                "Based on our conversation, suggest 3 short, relevant follow-up questions I might ask. "
                "Return the result as JSON with a 'questions' key containing the array of strings."
            ),
        },
    ]
    prompt_messages = _append_time_context(prompt_messages, user_timezone, user_locale, "related questions")
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
        output_schema=RelatedQuestionsResponse,
        thinking=thinking,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        contextMessageLimit=context_message_limit,
        searchProvider=search_provider,
        tavilyApiKey=tavily_api_key,
        skipDefaultTools=True,
        stream=True,
    )
    result = await run_agent_completion(request)
    content = result.get("content", "").strip()
    thought = result.get("thought", "").strip()
    output_obj = result.get("output")

    questions = []
    if output_obj:
        questions = _get_output_value(output_obj, "questions") or []

    if not questions:
        parsed = safe_json_parse(content)
        # If model returned a list directly, use it
        if isinstance(parsed, list):
            questions = parsed
        else:
            questions = _normalize_related_questions(parsed)
    if not questions and thought:
        thought_parsed = safe_json_parse(thought)
        if isinstance(thought_parsed, list):
            questions = thought_parsed
        else:
            questions = _normalize_related_questions(thought_parsed)

    # Robust cleanup for weird formats
    if not questions and content:
        import re
        # Try to find questions=["..." or questions=['...']
        match = re.search(r"questions=\[([\s\S]*?)\]", content)
        if match:
            raw_list = match.group(1)
            questions = [q.strip().strip("'").strip('"') for q in re.findall(r"['\"](.*?)['\"]", raw_list)]

        # New Fallback: Try to find numbered lists like 1. "Question" or 1. **Question**
        if not questions:
            # Matches strings starting with number, dot, maybe whitespace, maybe quotes/stars, then text, then closing quotes/stars
            numbered_matches = re.findall(r"^\d+\.\s+[*\"']+(.*?)[*\"']+", content, re.MULTILINE)
            if numbered_matches:
                questions = [q.strip() for q in numbered_matches]
            else:
                # Last ditch: simplified numbered list without quotes
                numbered_matches_simple = re.findall(r"^\d+\.\s+(.*?)$", content, re.MULTILINE)
                if numbered_matches_simple:
                    questions = [q.strip().strip('*').strip('"').strip("'") for q in numbered_matches_simple]

    return _normalize_related_questions(questions)


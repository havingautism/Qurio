"""
Stream chat service using Agno framework.
Main service that orchestrates AI providers, tools, and SSE streaming.
"""

import json
import re
from datetime import datetime
from typing import Any, AsyncGenerator, Callable

from agno.tools.tavily import TavilyTools
# JinaReaderTools removed
from agno.tools.calculator import CalculatorTools
from agno.tools.yfinance import YFinanceTools
from agno.tools.arxiv import ArxivTools
from agno.tools.wikipedia import WikipediaTools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.utils.log import logger

from ..models.stream_chat import (
    DoneEvent,
    ErrorEvent,
    SourceEvent,
    StreamChatRequest,
    TextEvent,
    ThoughtEvent,
    ToolCallEvent,
    ToolResultEvent,
)
from ..providers import ExecutionContext, get_provider_adapter
from .tools import execute_tool_by_name, get_tool_definitions_by_ids, is_local_tool_name, resolve_tool_name

# Regex for thinking tag parsing
THINKING_OPEN_PATTERN = re.compile(r"<(think|thought)>", re.IGNORECASE)
THINKING_CLOSE_PATTERN = re.compile(r"</(think|thought)>", re.IGNORECASE)

class StreamChatService:
    """
    Stream chat service that handles:
    - Multi-provider support (OpenAI, Gemini, GLM, etc.)
    - Tool calling (local, custom, MCP, Agno Toolkits)
    - SSE streaming with text, thoughts, and tool calls
    - Context limit handling
    """

    def __init__(self):
        self.max_loops = 10

    def _get_agno_toolkits(self, request: StreamChatRequest, tool_ids: list[str]) -> tuple[list[Any], dict[str, Callable]]:
        """
        Instantiate Agno toolkits based on request and return (schemas, function_map).
        Maps legacy tool IDs to new toolkits.
        """
        toolkits = []
        
        # Legacy ID mapping to Toolkits
        ids_set = set(tool_ids)
        
        # Check Legacy IDs or new IDs
        enable_tavily = any(id in ids_set for id in ["Tavily_web_search", "web_search", "search", "Tavily_academic_search", "academic_search"])
        # enable_jina removed - native webpage_reader used instead via CUSTOM_TOOLS
        enable_calc = any(id in ids_set for id in ["calculator", "math"])
        
        # Auto-enable new tools if they are in the list or if we want them default (optional)
        enable_finance = "yfinance" in ids_set or "finance" in ids_set
        enable_arxiv = "arxiv" in ids_set or "research" in ids_set
        enable_wiki = "wikipedia" in ids_set or "wiki" in ids_set
        enable_ddg = "duckduckgo" in ids_set
        
        # Instantiate Toolkits
        if enable_tavily and request.tavily_api_key:
            toolkits.append(TavilyTools(api_key=request.tavily_api_key))
        elif enable_ddg: # Fallback or explicit
             toolkits.append(DuckDuckGoTools())
             
        # Jina logic removed

        if enable_calc:
            toolkits.append(CalculatorTools())
            
        if enable_finance:
            toolkits.append(YFinanceTools(stock_price=True, company_info=True, analyst_recommendations=True))
            
        if enable_arxiv:
            toolkits.append(ArxivTools())
            
        if enable_wiki:
            toolkits.append(WikipediaTools())

        # Reset registry
        schemas = []
        registry = {}

        # Extract tools from toolkits
        for tk in toolkits:
            # Toolkit.get_tools() returns a list of Tool objects (which contain 'endpoint' callable and 'entrypoint' name)
            # OR directly functions. Agno Toolkits are diverse.
            # Most Official Toolkits in Agno:
            # toolkit.get_tools() returns list of `ToolkitTool` or `Function`.
            
            # We rely on the toolkit's export.
            # Usually: toolkit.get_tools() -> list of tools
            tk_tools = tk.get_tools() if hasattr(tk, "get_tools") else []
            
            for tool in tk_tools:
                # schema
                if hasattr(tool, "to_openai_function"):
                    schemas.append({"type": "function", "function": tool.to_openai_function()})
                elif hasattr(tool, "to_dict"):
                    schemas.append(tool.to_dict())
                else: 
                     # Fallback for manual inspection (rare in Agno)
                     pass
                
                # registry
                # Agno tools have .name and .entrypoint (callable)
                if hasattr(tool, "name") and hasattr(tool, "entrypoint"):
                     registry[tool.name] = tool.entrypoint
                elif hasattr(tool, "__name__"):
                     registry[tool.__name__] = tool

        return schemas, registry

    async def stream_chat(
        self,
        request: StreamChatRequest,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream chat completion with tool calling support.
        """
        try:
            # Validate request
            self._validate_request(request)

            # Get provider adapter
            adapter = get_provider_adapter(request.provider)

            # Prepare messages with context limit
            messages = adapter.apply_context_limit(
                request.messages,
                request.context_message_limit,
            )

            # 1. Get Custom/Legacy Tool Definitions
            # These are tools STILL in tools.py (interactive_form, etc.)
            custom_tool_definitions = get_tool_definitions_by_ids(request.tool_ids)
            
            # 2. Get User Tools (frontend defined)
            user_tool_definitions = self._convert_user_tools(request.user_tools)

            # 3. Get Agno Toolkit Tools
            toolkit_schemas, toolkit_registry = self._get_agno_toolkits(request, request.tool_ids)

            # Convert ToolDefinition models to dicts and combine all tools
            request_tools_dict = [tool.model_dump() for tool in (request.tools or [])]
            all_tools = [
                *request_tools_dict,
                *custom_tool_definitions,
                *user_tool_definitions,
                *toolkit_schemas,
            ]
            all_tools = self._deduplicate_tools(all_tools)

            # Tool calling loop
            current_messages = messages
            loops = 0
            sources_map: dict[str, Any] = {}
            full_content = ""
            full_thought = ""

            while loops < self.max_loops:
                loops += 1

                # Build execution context
                context = ExecutionContext(
                    messages=current_messages,
                    tools=all_tools if all_tools else None,
                    tool_choice=request.tool_choice,
                    temperature=request.temperature,
                    top_p=request.top_p,
                    top_k=request.top_k,
                    frequency_penalty=request.frequency_penalty,
                    presence_penalty=request.presence_penalty,
                    response_format=request.response_format,
                    thinking=request.thinking,
                    stream=request.stream,
                    tavily_api_key=request.tavily_api_key,
                )

                # Execute via provider
                chunk_buffer = {"text": "", "thought": ""}
                pending_tool_calls: list[dict[str, Any]] = []

                async for chunk in adapter.execute(
                    context=context,
                    api_key=request.api_key,
                    model=request.model,
                    base_url=request.base_url,
                ):
                    match chunk.type:
                        case "text":
                            content = chunk.content
                            parsed = self._parse_thinking_tags(content, request.thinking is not None)
                            chunk_buffer["text"] += parsed["text"]
                            if parsed["thought"]:
                                chunk_buffer["thought"] += parsed["thought"]

                            if chunk_buffer["text"]:
                                full_content += chunk_buffer["text"]
                                yield TextEvent(content=chunk_buffer["text"]).model_dump()
                                chunk_buffer["text"] = ""

                            if chunk_buffer["thought"]:
                                full_thought += chunk_buffer["thought"]
                                yield ThoughtEvent(content=chunk_buffer["thought"]).model_dump()
                                chunk_buffer["thought"] = ""

                        case "thought":
                            full_thought += chunk.thought
                            yield ThoughtEvent(content=chunk.thought).model_dump()

                        case "tool_calls":
                            pending_tool_calls = chunk.tool_calls or []
                            for tool_call in pending_tool_calls:
                                function = tool_call.get("function", {})
                                yield ToolCallEvent(
                                    id=tool_call.get("id"),
                                    name=function.get("name", ""),
                                    arguments=function.get("arguments", ""),
                                ).model_dump()

                        case "tool_result":
                            tool_results = chunk.tool_calls or []
                            for tool_res in tool_results:
                                yield ToolResultEvent(
                                    id=tool_res.get("id"),
                                    name=tool_res.get("name", ""),
                                    status=tool_res.get("status", "done"),
                                    output=tool_res.get("output"),
                                ).model_dump()

                        case "done":
                            if chunk.finish_reason != "tool_calls":
                                yield DoneEvent(
                                    content=full_content,
                                    thought=full_thought or None,
                                    sources=list(sources_map.values()) or None,
                                ).model_dump()
                                return

                        case "error":
                            yield ErrorEvent(error=chunk.error or "Unknown error").model_dump()
                            return

                # Execute tools if any
                if pending_tool_calls:
                    current_messages.append({
                        "role": "assistant",
                        "content": "",
                        "tool_calls": pending_tool_calls,
                    })

                    for tool_call in pending_tool_calls:
                        function = tool_call.get("function", {})
                        tool_name = function.get("name", "")
                        tool_args_str = function.get("arguments", "{}")

                        try:
                            try:
                                tool_args = json.loads(tool_args_str)
                            except json.JSONDecodeError:
                                tool_args = {}

                            started_at = datetime.now()
                            
                            # EXECUTE TOOL
                            # Check Agno Toolkit Registry first
                            if tool_name in toolkit_registry:
                                func = toolkit_registry[tool_name]
                                # Call function - support both sync and async?
                                # Agno tools are generally synchronous or async. We wrap them.
                                try:
                                    if asyncio.iscoroutinefunction(func):
                                        result = await func(**tool_args)
                                    else:
                                        result = func(**tool_args)
                                        # If result is an object/Toolkit wrapper, dump it?
                                        # Agno tools return specific types sometimes, but usually strings/dicts.
                                        if hasattr(result, "content"): # Message object?
                                            result = result.content
                                except Exception as e_inner:
                                     raise ValueError(f"Agno Tool Error: {e_inner}")
                            else:
                                # Fallback to existing logic
                                result = await self._execute_tool(
                                    tool_name=tool_name,
                                    args=tool_args,
                                    request=request,
                                )
                                
                            duration_ms = int((datetime.now() - started_at).total_seconds() * 1000)

                            if self._is_search_tool(tool_name):
                                self._collect_search_sources(result, sources_map)

                            yield ToolResultEvent(
                                id=tool_call.get("id"),
                                name=tool_name,
                                status="done",
                                output=result,
                                duration_ms=duration_ms,
                            ).model_dump()

                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call.get("id"),
                                "name": tool_name,
                                "content": json.dumps(result, default=str),
                            })

                        except Exception as e:
                            logger.error(f"Tool execution failed: {e}")
                            yield ToolResultEvent(
                                id=tool_call.get("id"),
                                name=tool_name,
                                status="error",
                                error=str(e),
                            ).model_dump()

                            current_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call.get("id"),
                                "name": tool_name,
                                "content": json.dumps({"error": str(e)}),
                            })

                    continue

                yield DoneEvent(
                    content=full_content,
                    thought=full_thought or None,
                    sources=list(sources_map.values()) or None,
                ).model_dump()
                return

            yield DoneEvent(
                content=full_content,
                thought=full_thought or None,
                sources=list(sources_map.values()) or None,
            ).model_dump()

        except Exception as e:
            logger.error(f"Stream chat error: {e}")
            yield ErrorEvent(error=str(e)).model_dump()

    def _validate_request(self, request: StreamChatRequest) -> None:
        if not request.provider:
            raise ValueError("Missing required field: provider")
        if not request.api_key:
            raise ValueError("Missing required field: apiKey")
        if not request.messages:
            raise ValueError("Missing required field: messages")

        from ..providers import is_provider_supported
        if not is_provider_supported(request.provider):
            raise ValueError(f"Unsupported provider: {request.provider}")

    def _convert_user_tools(self, user_tools: list[Any]) -> list[dict[str, Any]]:
        definitions = []
        for tool in user_tools:
            parameters = (
                tool.input_schema
                if hasattr(tool, "input_schema") and tool.input_schema
                else tool.parameters if hasattr(tool, "parameters") else {}
            )
            definitions.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": parameters,
                },
            })
        return definitions

    def _deduplicate_tools(self, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen = set()
        unique_tools = []
        for tool in tools:
            name = tool.get("function", {}).get("name", "")
            if name and name not in seen:
                seen.add(name)
                unique_tools.append(tool)
        return unique_tools

    def _parse_thinking_tags(self, text: str, enable_tags: bool) -> dict[str, str]:
        if not enable_tags:
            return {"text": text, "thought": ""}

        result = {"text": "", "thought": ""}
        remaining = text
        in_thought = False

        while remaining:
            if not in_thought:
                match = THINKING_OPEN_PATTERN.search(remaining)
                if not match:
                    result["text"] += remaining
                    break
                result["text"] += remaining[:match.start()]
                remaining = remaining[match.end():]
                in_thought = True
            else:
                match = THINKING_CLOSE_PATTERN.search(remaining)
                if not match:
                    result["thought"] += remaining
                    break
                result["thought"] += remaining[:match.start()]
                remaining = remaining[match.end():]
                in_thought = False

        return result

    async def _execute_tool(
        self,
        tool_name: str,
        args: dict[str, Any],
        request: StreamChatRequest,
    ) -> dict[str, Any]:
        """Execute a local/custom tool by name."""
        user_tools_map = {tool.name: tool for tool in request.user_tools}

        if tool_name in user_tools_map:
            return await self._execute_custom_tool(user_tools_map[tool_name], args)

        if is_local_tool_name(tool_name) or resolve_tool_name(tool_name) != tool_name:
            tool_config = {
                "tavilyApiKey": request.tavily_api_key,
                "searchProvider": request.search_provider,
            }
            return await execute_tool_by_name(tool_name, args, tool_config)

        raise ValueError(f"Unknown tool: {tool_name}")

    def _is_search_tool(self, tool_name: str) -> bool:
        # Check standard names and Agno function names
        return tool_name in {
            "Tavily_web_search", 
            "tavily_search", 
            "web_search", 
            "academic_search", 
            "search",
            "duckduckgo_search",
            "search_google", # if using google search
        } or "search" in tool_name.lower()

    def _collect_search_sources(
        self,
        result: Any,
        sources_map: dict[str, Any],
    ) -> None:
        """Collect sources from search tool result."""
        # Agno results usually return string or object.
        # If string, we might try to extract URLs? No, usually formatted.
        # If it returns a JSON-like dict, we look for 'results'
        
        results = []
        if isinstance(result, dict):
            results = result.get("results", [])
        elif isinstance(result, str):
             # Try to parse if it's JSON string
             try:
                 parsed = json.loads(result)
                 if isinstance(parsed, dict):
                     results = parsed.get("results", [])
             except:
                 pass
        
        if not isinstance(results, list):
            return

        for item in results:
            url = item.get("url") or item.get("link") or item.get("uri")
            if not url or url in sources_map:
                continue
            sources_map[url] = SourceEvent(
                uri=url,
                title=item.get("title", "Unknown Source"),
                snippet=item.get("content", item.get("snippet", ""))[:200],
            ).model_dump()

    async def _execute_custom_tool(
        self,
        tool: Any,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "tool": tool.name,
            "executed": True,
            "args": args,
        }

_stream_chat_service: StreamChatService | None = None

def get_stream_chat_service() -> StreamChatService:
    global _stream_chat_service
    if _stream_chat_service is None:
        _stream_chat_service = StreamChatService()
    return _stream_chat_service

from pydantic import ValidationError

from src.models.stream_chat import StreamChatRequest
from src.providers.factory import SUPPORTED_PROVIDERS


def test_stream_chat_request_accepts_all_supported_providers() -> None:
    for provider in SUPPORTED_PROVIDERS:
        request = StreamChatRequest(
            provider=provider,
            apiKey="test-key",
            messages=[{"role": "user", "content": "hello"}],
        )
        assert request.provider == provider


def test_stream_chat_request_rejects_unknown_provider() -> None:
    try:
        StreamChatRequest(
            provider="openrouterr",
            apiKey="test-key",
            messages=[{"role": "user", "content": "hello"}],
        )
    except ValidationError as exc:
        assert "Unsupported provider" in str(exc)
    else:  # pragma: no cover - defensive guard
        raise AssertionError("Expected ValidationError for unsupported provider")


def test_stream_chat_provider_schema_matches_supported_providers() -> None:
    schema = StreamChatRequest.model_json_schema()
    assert schema["properties"]["provider"]["enum"] == SUPPORTED_PROVIDERS

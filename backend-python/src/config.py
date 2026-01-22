"""
Application configuration using Pydantic Settings.
Loads configuration from environment variables and .env files.
"""

import os
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def get_backend_dir() -> Path:
    """Get the backend directory path."""
    # Try to get from environment first
    if env_path := os.getenv("BACKEND_DIR"):
        return Path(env_path)
    # Fallback to script location
    return Path(__file__).parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server Configuration
    host: str = Field(default="198.18.0.1", alias="HOST")
    port: int = Field(default=3002, alias="PORT")

    # CORS Configuration
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")
    frontend_urls: str = Field(
        default="http://localhost:3000",
        alias="FRONTEND_URLS",
    )

    # SSE Configuration
    sse_flush_ms: int = Field(default=50, alias="SSE_FLUSH_MS")
    sse_heartbeat_ms: int = Field(default=15000, alias="SSE_HEARTBEAT_MS")

    # Supabase Configuration
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # Tavily API (for web search)
    tavily_api_key: str = Field(default="", alias="TAVILY_API_KEY")

    # Jina AI (for webpage reading)
    jina_api_key: str = Field(default="", alias="JINA_API_KEY")

    # Debug Flags
    debug_stream: bool = Field(default=False, alias="DEBUG_STREAM")
    debug_tools: bool = Field(default=False, alias="DEBUG_TOOLS")
    debug_sources: bool = Field(default=False, alias="DEBUG_SOURCES")

    # Context Message Limit
    context_message_limit: int = Field(default=50, alias="CONTEXT_MESSAGE_LIMIT")

    # Model configuration
    @property
    def allowed_origins(self) -> list[str]:
        """Parse frontend_urls into a list of allowed origins."""
        return [origin.strip() for origin in self.frontend_urls.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        extra="ignore",
    )

    @field_validator("sse_flush_ms", "sse_heartbeat_ms")
    @classmethod
    def validate_positive(cls, v: int) -> int:
        """Validate that numeric values are non-negative."""
        return max(0, v)


# Global settings instance
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get the global settings instance (singleton)."""
    global _settings
    if _settings is None:
        # Load from backend-python/.env if it exists
        backend_dir = Path(__file__).parent.parent
        env_path = backend_dir / ".env"
        env_local_path = backend_dir / ".env.local"

        # Priority: .env.local > .env > defaults
        env_file = None
        if env_local_path.exists():
            env_file = str(env_local_path)
        elif env_path.exists():
            env_file = str(env_path)

        _settings = Settings(_env_file=env_file)
    return _settings


def reload_settings() -> Settings:
    """Reload settings from environment variables."""
    global _settings
    _settings = None
    return get_settings()

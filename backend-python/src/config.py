"""
Application configuration using Pydantic Settings.
Loads configuration from environment variables and .env files.
"""

import os
from pathlib import Path

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
    host: str = Field(default="127.0.0.1", alias="HOST")
    port: int = Field(default=3002, alias="PORT")

    # CORS Configuration
    frontend_url: str = Field(default="http://localhost:3000", alias="FRONTEND_URL")
    frontend_urls: str = Field(
        default="http://localhost:3000",
        alias="FRONTEND_URLS",
    )

    # SSE Configuration
    sse_flush_ms: int = Field(default=50, alias="SSE_FLUSH_MS")
    sse_heartbeat_ms: int = Field(default=10000, alias="SSE_HEARTBEAT_MS")

    # Supabase Configuration
    supabase_project_name: str = Field(default="", alias="SUPABASE_PROJECT_NAME")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_password: str = Field(default="", alias="SUPABASE_PASSWORD")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_db_url: str = Field(default="", alias="SUPABASE_DB_URL")

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

    # Database Providers (backend-managed)
    database_providers_json: str = Field(default="", alias="DATABASE_PROVIDERS")
    db_access_key: str = Field(default="", alias="DB_PROVIDER_ACCESS_KEY")
    database_provider: str = Field(default="", alias="DATABASE_PROVIDER")
    database_url: str = Field(default="", alias="DATABASE_URL")
    database_path: str = Field(default="", alias="DATABASE_PATH")
    database_label: str = Field(default="", alias="DATABASE_LABEL")

    # Session Summary Configuration
    summary_lite_provider: str = Field(default="openai", alias="SUMMARY_LITE_PROVIDER")
    summary_lite_model: str = Field(default="gpt-4o-mini", alias="SUMMARY_LITE_MODEL")
    summary_agent_api_key: str = Field(default="", alias="SUMMARY_AGENT_API_KEY")
    summary_lite_base_url: str | None = Field(default=None, alias="SUMMARY_LITE_BASE_URL")

    # Memory Lite Model Configuration (Legacy / Long Term Memory)
    memory_lite_provider: str = Field(default="openai", alias="MEMORY_LITE_PROVIDER")
    memory_lite_model: str = Field(default="gpt-4o-mini", alias="MEMORY_LITE_MODEL")
    memory_agent_api_key: str = Field(default="", alias="MEMORY_AGENT_API_KEY")
    memory_lite_base_url: str | None = Field(default=None, alias="MEMORY_LITE_BASE_URL")


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
        if os.getenv("QURIO_ELECTRON", "0") == "1":
            _settings = Settings(_env_file=None)
            return _settings

        # Search paths for env files (priority order)
        src_dir = Path(__file__).parent
        backend_dir = src_dir.parent

        candidates = [
            src_dir / ".env.local",
            backend_dir / ".env.local",
            src_dir / ".env",
            backend_dir / ".env",
        ]

        env_file = None
        for candidate in candidates:
            if candidate.exists():
                env_file = str(candidate)
                break

        _settings = Settings(_env_file=env_file)
    return _settings


def reload_settings() -> Settings:
    """Reload settings from environment variables."""
    global _settings
    _settings = None
    return get_settings()

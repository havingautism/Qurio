"""
Abstract base class for email providers.
Defines the interface that all email provider implementations must follow,
making it easy to add new providers (Outlook, Yahoo, etc.) in the future.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass
class EmailMessage:
    """Normalized email message structure returned by all providers."""

    message_id: str          # Provider-specific unique ID (prevents duplicate processing)
    subject: str
    sender: str              # "Name <email@example.com>" format
    received_at: datetime
    body_text: str           # Plain text body (truncated to ~2000 chars for summarization)


class BaseEmailProvider(ABC):
    """
    Abstract base class for email providers.
    Each provider must implement fetch_new_emails().
    """

    @abstractmethod
    def fetch_new_emails(self, max_results: int = 20) -> list[EmailMessage]:
        """
        Fetch recent unread emails from the provider.

        Args:
            max_results: Maximum number of emails to return per poll cycle.

        Returns:
            List of EmailMessage objects, ordered newest first.
        """
        ...

    @abstractmethod
    def get_provider_name(self) -> str:
        """Return the provider identifier string (e.g. 'gmail')."""
        ...

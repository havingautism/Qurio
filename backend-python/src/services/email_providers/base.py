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
    Each provider must implement fetch_new_emails() and mark_as_read().
    """

    @abstractmethod
    def fetch_new_emails(self, max_results: int = 5) -> list[tuple[str, EmailMessage]]:
        """
        Fetch recent unread emails from the provider.

        Args:
            max_results: Maximum number of emails to return per poll cycle.

        Returns:
            List of (imap_id, EmailMessage) tuples, ordered newest first.
            imap_id is the provider-specific ID needed for mark_as_read().
        """
        ...

    @abstractmethod
    def mark_as_read(self, imap_id: str) -> bool:
        """
        Mark an email as read on the provider's server.

        Args:
            imap_id: The provider-specific message ID returned by fetch_new_emails.

        Returns:
            True if successful, False otherwise.
        """
        ...

    @abstractmethod
    def get_provider_name(self) -> str:
        """Return the provider identifier string (e.g. 'gmail')."""
        ...

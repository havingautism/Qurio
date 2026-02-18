"""
Gmail email provider using IMAP + App Password.

Authentication:
  User provides their Gmail address and a Google App Password (16-char).
  No OAuth2, no Google Cloud Console setup required.

How to get an App Password:
  1. Enable 2-Step Verification on your Google account
  2. Go to: myaccount.google.com/apppasswords
  3. Select "Mail" → Generate → copy the 16-char password
"""

from __future__ import annotations

import email
import imaplib
import logging
import socket
from datetime import datetime, timezone
from email.header import decode_header
from typing import Any

from .base import BaseEmailProvider, EmailMessage

logger = logging.getLogger(__name__)

# Gmail IMAP server settings
_IMAP_HOST = "imap.gmail.com"
_IMAP_PORT = 993

# Maximum body length sent to the summarization model (keeps token usage low)
_MAX_BODY_CHARS = 2000


def _decode_mime_header(raw: str | None) -> str:
    """Decode a MIME-encoded email header (e.g. =?UTF-8?B?...?=) to plain text."""
    if not raw:
        return ""
    parts = decode_header(raw)
    decoded_parts = []
    for part, charset in parts:
        if isinstance(part, bytes):
            try:
                decoded_parts.append(part.decode(charset or "utf-8", errors="replace"))
            except Exception:
                decoded_parts.append(part.decode("utf-8", errors="replace"))
        else:
            decoded_parts.append(str(part))
    return "".join(decoded_parts)


def _extract_body_text(msg: email.message.Message) -> str:
    """
    Extract plain-text body from an email.message.Message object.
    Prefers text/plain; falls back to stripping HTML from text/html.
    """
    text_plain = None
    text_html = None

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain" and text_plain is None:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text_plain = payload.decode(charset, errors="replace")
            elif content_type == "text/html" and text_html is None:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text_html = payload.decode(charset, errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            content_type = msg.get_content_type()
            if content_type == "text/plain":
                text_plain = payload.decode(charset, errors="replace")
            elif content_type == "text/html":
                text_html = payload.decode(charset, errors="replace")

    if text_plain:
        return text_plain[:_MAX_BODY_CHARS]

    if text_html:
        import re
        text = re.sub(r"<[^>]+>", " ", text_html)
        text = re.sub(r"\s+", " ", text).strip()
        return text[:_MAX_BODY_CHARS]

    return ""


class GmailProvider(BaseEmailProvider):
    """
    Gmail email provider using IMAP + App Password.

    Args:
        email_address: The Gmail address to connect to.
        app_password: Google App Password (16-char, no spaces).
    """

    def __init__(self, email_address: str, app_password: str) -> None:
        self._email = email_address
        self._password = app_password.replace(" ", "")  # Remove spaces if user copied with spaces

    def get_provider_name(self) -> str:
        return "gmail"

    def _connect(self) -> imaplib.IMAP4_SSL:
        """
        Open an authenticated IMAP4_SSL connection.
        Uses _imap_host/_imap_port if set (for non-Gmail providers),
        otherwise falls back to Gmail defaults.
        """
        host = getattr(self, "_imap_host", _IMAP_HOST)
        port = getattr(self, "_imap_port", _IMAP_PORT)
        try:
            mail = imaplib.IMAP4_SSL(host, port)
            mail.login(self._email, self._password)
            return mail
        except imaplib.IMAP4.error as e:
            raise ValueError(f"IMAP login failed: {e}") from e
        except socket.gaierror as e:
            raise ConnectionError(f"Cannot reach {host}: {e}") from e

    def test_connection(self) -> bool:
        """
        Test that the credentials are valid by opening and closing a connection.
        Returns True on success, raises on failure.
        """
        mail = self._connect()
        mail.logout()
        return True

    def fetch_new_emails(self, max_results: int = 20) -> list[EmailMessage]:
        """
        Fetch recent unread emails from Gmail INBOX via IMAP.

        Args:
            max_results: Maximum number of emails to return.

        Returns:
            List of EmailMessage objects, newest first.
        """
        try:
            mail = self._connect()
            try:
                mail.select("INBOX")

                # Search for UNSEEN (unread) messages
                status, data = mail.search(None, "UNSEEN")
                if status != "OK" or not data or not data[0]:
                    logger.info("[Gmail IMAP] No unread messages found.")
                    return []

                # Get message IDs, newest first, limited to max_results
                msg_ids = data[0].split()
                msg_ids = msg_ids[-max_results:]  # Take the last N (newest)
                msg_ids = list(reversed(msg_ids))  # Reverse to newest-first order

                results: list[EmailMessage] = []
                for msg_id in msg_ids:
                    try:
                        status, msg_data = mail.fetch(msg_id, "(RFC822)")
                        if status != "OK" or not msg_data or not msg_data[0]:
                            continue

                        raw_email = msg_data[0][1]
                        parsed = email.message_from_bytes(raw_email)
                        email_msg = self._parse_message(parsed)
                        if email_msg:
                            results.append(email_msg)
                    except Exception as e:
                        logger.warning("[Gmail IMAP] Failed to fetch message %s: %s", msg_id, e)

                logger.info("[Gmail IMAP] Fetched %d unread emails.", len(results))
                return results

            finally:
                try:
                    mail.logout()
                except Exception:
                    pass

        except Exception as e:
            logger.error("[Gmail IMAP] fetch_new_emails failed: %s", e)
            return []

    def _parse_message(self, msg: email.message.Message) -> EmailMessage | None:
        """Parse a Python email.message.Message into an EmailMessage."""
        try:
            subject = _decode_mime_header(msg.get("Subject", "(No Subject)"))
            sender = _decode_mime_header(msg.get("From", "Unknown"))
            message_id = msg.get("Message-ID", "").strip()

            # Parse date header
            date_str = msg.get("Date", "")
            try:
                from email.utils import parsedate_to_datetime
                received_at = parsedate_to_datetime(date_str)
                if received_at.tzinfo is None:
                    received_at = received_at.replace(tzinfo=timezone.utc)
            except Exception:
                received_at = datetime.now(tz=timezone.utc)

            body_text = _extract_body_text(msg)

            return EmailMessage(
                message_id=message_id or f"{sender}:{subject}:{date_str}",
                subject=subject,
                sender=sender,
                received_at=received_at,
                body_text=body_text,
            )
        except Exception as e:
            logger.warning("[Gmail IMAP] Failed to parse message: %s", e)
            return None

    @staticmethod
    def build_imap_provider(
        email_address: str,
        app_password: str,
        imap_host: str = _IMAP_HOST,
        imap_port: int = _IMAP_PORT,
    ) -> "GmailProvider":
        """
        Factory method — creates a GmailProvider and validates credentials.
        Raises ValueError if login fails.
        """
        provider = GmailProvider(email_address, app_password)
        provider.test_connection()
        return provider

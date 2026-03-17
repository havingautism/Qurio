"""
Generic IMAP email provider using IMAP4_SSL + App Password.

Supports any email service that uses standard IMAP:
  - Gmail (imap.gmail.com:993)
  - Outlook (outlook.office365.com:993)
  - QQ Mail (imap.qq.com:993)
  - 163 Mail (imap.163.com:993)
  - Any other standard IMAP server

Authentication:
  User provides their email address and an App Password (or IMAP password).
  No OAuth2 required — uses standard IMAP LOGIN command.
"""

from __future__ import annotations

import email
import hashlib
import imaplib
import logging
import socket
from datetime import UTC, datetime
from email.header import decode_header

from .base import BaseEmailProvider, EmailMessage

logger = logging.getLogger(__name__)

# Default IMAP server settings (Gmail fallback)
_DEFAULT_IMAP_HOST = "imap.gmail.com"
_DEFAULT_IMAP_PORT = 993

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


class ImapProvider(BaseEmailProvider):
    """
    Generic IMAP email provider supporting Gmail, Outlook, QQ, 163, and any
    standard IMAP server.

    Args:
        email_address: The email address to connect to.
        app_password: App Password or IMAP password (spaces are stripped automatically).
        imap_host: IMAP server hostname (default: imap.gmail.com).
        imap_port: IMAP server port (default: 993).
    """

    def __init__(
        self,
        email_address: str,
        app_password: str,
        imap_host: str = _DEFAULT_IMAP_HOST,
        imap_port: int = _DEFAULT_IMAP_PORT,
    ) -> None:
        self._email = email_address
        self._password = app_password.replace(" ", "")  # Remove spaces if user copied with spaces
        self._imap_host = imap_host
        self._imap_port = imap_port

    def get_provider_name(self) -> str:
        return "imap"

    def _connect(self) -> imaplib.IMAP4_SSL:
        """Open an authenticated IMAP4_SSL connection."""
        try:
            mail = imaplib.IMAP4_SSL(self._imap_host, self._imap_port)
            mail.login(self._email, self._password)
            return mail
        except imaplib.IMAP4.error as e:
            raise ValueError(f"IMAP login failed: {e}") from e
        except socket.gaierror as e:
            raise ConnectionError(f"Cannot reach {self._imap_host}: {e}") from e

    def test_connection(self) -> bool:
        """
        Test that the credentials are valid by opening and closing a connection.
        Returns True on success, raises on failure.
        """
        mail = self._connect()
        mail.logout()
        return True

    def fetch_new_emails(self, max_results: int = 5) -> list[tuple[str, EmailMessage]]:
        """
        Fetch recent unread emails from INBOX via IMAP.

        Args:
            max_results: Maximum number of emails to return.

        Returns:
            List of (imap_id, EmailMessage) tuples, newest first.
            imap_id is the IMAP message ID needed for mark_as_read.
        """
        try:
            mail = self._connect()
            try:
                mail.select("INBOX")

                # Search for all UNSEEN (unread) messages
                status, data = mail.search(None, "UNSEEN")
                if status != "OK" or not data or not data[0]:
                    logger.info("[IMAP] No unread messages found.")
                    return []

                # Get message IDs, newest first, limited to max_results
                msg_ids = data[0].split()
                msg_ids = msg_ids[-max_results:]  # Take the last N (newest)
                msg_ids = list(reversed(msg_ids))  # Reverse to newest-first order

                results: list[tuple[str, EmailMessage]] = []
                for msg_id in msg_ids:
                    try:
                        # Use BODY.PEEK[] to fetch without marking as read (not setting \Seen flag)
                        status, msg_data = mail.fetch(msg_id, "(BODY.PEEK[])")
                        if status != "OK" or not msg_data or not msg_data[0]:
                            continue

                        raw_email = msg_data[0][1]
                        parsed = email.message_from_bytes(raw_email)
                        email_msg = self._parse_message(parsed, raw_email)
                        if email_msg:
                            results.append((msg_id.decode() if isinstance(msg_id, bytes) else msg_id, email_msg))
                    except Exception as e:
                        logger.warning("[IMAP] Failed to fetch message %s: %s", msg_id, e)

                logger.info("[IMAP] Fetched %d unread emails.", len(results))
                return results

            finally:
                try:
                    mail.logout()
                except Exception:
                    pass

        except Exception as e:
            logger.error("[IMAP] fetch_new_emails failed: %s", e)
            return []

    def check_messages_unread_status(self, message_ids: list[str]) -> set[str]:
        """
        Check which of the given Message-IDs are still UNSEEN on the IMAP server.

        Instead of fetching ALL unread emails (which could be thousands),
        we only query the specific message_ids we care about (at most 5 from DB).
        Uses IMAP SEARCH with HEADER Message-ID filter — very lightweight.

        Args:
            message_ids: List of email Message-ID strings to check.

        Returns:
            Set of Message-ID strings that are still UNSEEN (unread) on the server.
        """
        if not message_ids:
            return set()

        try:
            mail = self._connect()
            try:
                mail.select("INBOX")
                still_unread: set[str] = set()

                for msg_id in message_ids:
                    try:
                        # Search for this specific message that is still UNSEEN
                        # IMAP SEARCH: UNSEEN + HEADER Message-ID <id>
                        status, data = mail.search(
                            None, "UNSEEN", f'HEADER Message-ID "{msg_id}"'
                        )
                        if status == "OK" and data and data[0]:
                            # If search returns any result, the message is still unread
                            still_unread.add(msg_id)
                    except Exception as e:
                        logger.warning(
                            "[IMAP] Failed to check unread status for %s: %s", msg_id, e
                        )

                logger.info(
                    "[IMAP] Checked %d message IDs, %d still unread.",
                    len(message_ids), len(still_unread),
                )
                return still_unread

            finally:
                try:
                    mail.logout()
                except Exception:
                    pass

        except Exception as e:
            logger.error("[IMAP] check_messages_unread_status failed: %s", e)
            # On error, assume all are still unread to avoid false positives
            return set(message_ids)

    def mark_as_read(self, imap_id: str) -> bool:
        """
        Mark a single email as read (SEEN) on the IMAP server.

        Args:
            imap_id: The IMAP message ID returned by fetch_new_emails.

        Returns:
            True if successful, False otherwise.
        """
        try:
            mail = self._connect()
            try:
                mail.select("INBOX")
                # Add the \Seen flag to the message
                status = mail.store(imap_id, "+FLAGS", "\\Seen")
                if status[0] == "OK":
                    logger.info("[IMAP] Marked message %s as read.", imap_id)
                    return True
                else:
                    logger.warning("[IMAP] Failed to mark message %s as read: %s", imap_id, status)
                    return False
            finally:
                try:
                    mail.logout()
                except Exception:
                    pass
        except Exception as e:
            logger.error("[IMAP] mark_as_read failed for %s: %s", imap_id, e)
            return False

    def _parse_message(self, msg: email.message.Message, raw_email: bytes | None = None) -> EmailMessage | None:
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
                    received_at = received_at.replace(tzinfo=UTC)
            except Exception:
                received_at = datetime.now(tz=UTC)

            body_text = _extract_body_text(msg)

            # Generate stable fallback message_id using hash of raw email content
            if not message_id and raw_email:
                message_id = hashlib.sha256(raw_email).hexdigest()[:32]
            elif not message_id:
                # Last resort: use timestamp + sender + subject hash
                fallback_data = f"{date_str}:{sender}:{subject}"
                message_id = hashlib.sha256(fallback_data.encode()).hexdigest()[:32]

            return EmailMessage(
                message_id=message_id,
                subject=subject,
                sender=sender,
                received_at=received_at,
                body_text=body_text,
            )
        except Exception as e:
            logger.warning("[IMAP] Failed to parse message: %s", e)
            return None

    @staticmethod
    def build_imap_provider(
        email_address: str,
        app_password: str,
        imap_host: str = _DEFAULT_IMAP_HOST,
        imap_port: int = _DEFAULT_IMAP_PORT,
    ) -> ImapProvider:
        """
        Factory method — creates an ImapProvider and validates credentials.
        Raises ValueError if login fails.
        """
        provider = ImapProvider(email_address, app_password, imap_host, imap_port)
        provider.test_connection()
        return provider


# Backward compatibility alias — keeps old imports working during transition
GmailProvider = ImapProvider

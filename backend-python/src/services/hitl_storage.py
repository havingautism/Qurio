"""
In-memory storage for HITL pending form runs.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from .hitl_serializer import serialize_requirements, deserialize_requirements

logger = logging.getLogger(__name__)


class InMemoryHITLStorage:
    """
    In-memory storage for HITL pending runs.
    """

    def __init__(self):
        self._store: Dict[str, Dict[str, Any]] = {}

    async def save_pending_run(
        self,
        run_id: str,
        requirements: List,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        agent_model: Optional[str] = None,
        ttl_minutes: int = 30,
        messages: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        requirements_data = serialize_requirements(requirements)
        expires_at = (datetime.utcnow() + timedelta(minutes=ttl_minutes)).isoformat()
        record = {
            "run_id": run_id,
            "requirements_data": requirements_data,
            "expires_at": expires_at,
            "status": "pending",
            "conversation_id": conversation_id,
            "user_id": user_id,
            "agent_model": agent_model,
            "messages": messages,
        }
        self._store[run_id] = record
        logger.info("[HITL] Stored pending run in memory: %s", run_id)
        return record

    async def get_pending_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        record = self._store.get(run_id)
        if not record:
            logger.warning("[HITL] Pending run %s not found in memory", run_id)
            return None
        expires_at = record.get("expires_at")
        if expires_at and expires_at <= datetime.utcnow().isoformat():
            self._store.pop(run_id, None)
            logger.warning("[HITL] Pending run %s expired in memory", run_id)
            return None
        requirements_data = record.get("requirements_data") or []
        requirements = deserialize_requirements(requirements_data)
        return {
            "requirements": requirements,
            "messages": record.get("messages"),
            "record": record,
        }

    async def delete_pending_run(self, run_id: str) -> bool:
        if run_id in self._store:
            self._store.pop(run_id, None)
            return True
        return False

    async def mark_as_submitted(self, run_id: str) -> bool:
        record = self._store.get(run_id)
        if not record:
            return False
        record["status"] = "submitted"
        record["submitted_at"] = datetime.utcnow().isoformat()
        self._store[run_id] = record
        return True

    async def cleanup_expired_runs(self) -> int:
        now_iso = datetime.utcnow().isoformat()
        expired = [
            k
            for k, v in self._store.items()
            if v.get("expires_at") and v["expires_at"] < now_iso
        ]
        for key in expired:
            self._store.pop(key, None)
        return len(expired)


_memory_storage: Optional[InMemoryHITLStorage] = None


def get_hitl_storage() -> InMemoryHITLStorage:
    """
    Get the global HITL storage instance (singleton pattern).

    Returns:
        InMemoryHITLStorage instance
    """
    global _memory_storage
    if _memory_storage is None:
        _memory_storage = InMemoryHITLStorage()
    return _memory_storage

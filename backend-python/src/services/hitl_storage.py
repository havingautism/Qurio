"""
Supabase Database Operations for HITL Pending Form Runs

This module handles all database interactions for storing and retrieving
paused HITL run state in Supabase.
"""

import os
import logging
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from supabase import create_client, Client

from ..config import get_settings
from .hitl_serializer import serialize_requirements, deserialize_requirements

logger = logging.getLogger(__name__)


def is_valid_uuid(val: Any) -> bool:
    """Check if a value is a valid UUID string."""
    if not val or not isinstance(val, str):
        return False
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False


class SupabaseHITLStorage:
    """
    Supabase storage manager for HITL pending form runs.
    
    This class handles:
    - Saving paused run state to Supabase
    - Retrieving run state for resumption
    - Cleaning up expired/completed runs
    """
    
    def __init__(self):
        """Initialize Supabase client with service role credentials."""
        settings = get_settings()
        supabase_url = settings.supabase_url
        supabase_key = settings.supabase_service_role_key
        
        if not supabase_url or not supabase_key:
            logger.warning(
                "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. "
                "HITL form persistence will not work."
            )
            self.client = None
        else:
            self.client: Optional[Client] = create_client(supabase_url, supabase_key)
            logger.info("Supabase HITL storage initialized")
    
    async def save_pending_run(
        self,
        run_id: str,
        requirements: List,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        agent_model: Optional[str] = None,
        ttl_minutes: int = 30
    ) -> Optional[Dict[str, Any]]:
        """
        Save a paused run's requirements to Supabase.
        
        Args:
            run_id: Unique identifier for the agent run
            requirements: List of Agno Requirement objects to serialize
            conversation_id: Associated conversation ID (optional)
            user_id: User who initiated the run (optional)
            agent_model: Model name used for the run (optional)
            ttl_minutes: Time-to-live in minutes before expiration (default: 30)
            
        Returns:
            Inserted record or None if failed
            
        Raises:
            Exception: If Supabase client not initialized or insert fails
        """
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        
        # Serialize requirements
        requirements_data = serialize_requirements(requirements)
        
        # Calculate expiration time
        expires_at = (datetime.utcnow() + timedelta(minutes=ttl_minutes)).isoformat()
        
        # Prepare record
        record = {
            "run_id": run_id,
            "requirements_data": requirements_data,
            "expires_at": expires_at,
            "status": "pending"
        }
        
        if is_valid_uuid(conversation_id):
            record["conversation_id"] = conversation_id
        if is_valid_uuid(user_id):
            record["user_id"] = user_id
        if agent_model:
            record["agent_model"] = agent_model
        
        try:
            # Insert into Supabase
            result = self.client.table("pending_form_runs").insert(record).execute()
            
            if result.data:
                logger.info(
                    f"Saved pending run {run_id} "
                    f"(conversation: {conversation_id}, expires in {ttl_minutes}m)"
                )
                return result.data[0]
            else:
                logger.error(f"Failed to save pending run {run_id}: no data returned")
                return None
                
        except Exception as e:
            logger.error(f"Error saving pending run {run_id}: {e}")
            raise
    
    async def get_pending_run(self, run_id: str) -> Optional[List]:
        """
        Retrieve a paused run's requirements from Supabase.
        
        Args:
            run_id: Unique identifier for the agent run
            
        Returns:
            Deserialized list of Requirement objects, or None if not found/expired
            
        Raises:
            Exception: If Supabase client not initialized or query fails
        """
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            # Query Supabase
            result = self.client.table("pending_form_runs") \
                .select("*") \
                .eq("run_id", run_id) \
                .gt("expires_at", datetime.utcnow().isoformat()) \
                .eq("status", "pending") \
                .single() \
                .execute()
            
            if not result.data:
                logger.warning(f"Pending run {run_id} not found or expired")
                return None
            
            # Deserialize requirements
            requirements_data = result.data["requirements_data"]
            requirements = deserialize_requirements(requirements_data)
            
            logger.info(
                f"Retrieved pending run {run_id} "
                f"({len(requirements)} requirements)"
            )
            return requirements
            
        except Exception as e:
            logger.error(f"Error retrieving pending run {run_id}: {e}")
            return None
    
    async def delete_pending_run(self, run_id: str) -> bool:
        """
        Delete a pending run record (called after successful resumption).
        
        Args:
            run_id: Unique identifier for the agent run
            
        Returns:
            True if deleted successfully, False otherwise
        """
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            result = self.client.table("pending_form_runs") \
                .delete() \
                .eq("run_id", run_id) \
                .execute()
            
            logger.info(f"Deleted pending run {run_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting pending run {run_id}: {e}")
            return False
    
    async def mark_as_submitted(self, run_id: str) -> bool:
        """
        Mark a pending run as submitted (optional status tracking).
        
        Args:
            run_id: Unique identifier for the agent run
            
        Returns:
            True if updated successfully, False otherwise
        """
        if not self.client:
            raise RuntimeError("Supabase client not initialized")
        
        try:
            result = self.client.table("pending_form_runs") \
                .update({
                    "status": "submitted",
                    "submitted_at": datetime.utcnow().isoformat()
                }) \
                .eq("run_id", run_id) \
                .execute()
            
            logger.info(f"Marked pending run {run_id} as submitted")
            return True
            
        except Exception as e:
            logger.error(f"Error marking run {run_id} as submitted: {e}")
            return False
    
    async def cleanup_expired_runs(self) -> int:
        """
        Clean up expired pending run records.
        
        Returns:
            Number of records deleted
        """
        if not self.client:
            return 0
        
        try:
            result = self.client.table("pending_form_runs") \
                .delete() \
                .lt("expires_at", datetime.utcnow().isoformat()) \
                .execute()
            
            count = len(result.data) if result.data else 0
            logger.info(f"Cleaned up {count} expired pending runs")
            return count
            
        except Exception as e:
            logger.error(f"Error cleaning up expired runs: {e}")
            return 0


# Global singleton instance
_hitl_storage: Optional[SupabaseHITLStorage] = None


def get_hitl_storage() -> SupabaseHITLStorage:
    """
    Get the global HITL storage instance (singleton pattern).
    
    Returns:
        SupabaseHITLStorage instance
    """
    global _hitl_storage
    if _hitl_storage is None:
        _hitl_storage = SupabaseHITLStorage()
    return _hitl_storage

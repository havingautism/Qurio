"""
HITL Requirements Serialization Utilities

This module handles serialization and deserialization of Agno HITL requirements
to enable storing run state in Supabase between HTTP requests.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def serialize_requirements(requirements: list) -> list[dict[str, Any]]:
    """
    Serialize Agno RunRequirement objects to JSON-compatible format.
    """
    serialized = []
    for req in requirements:
        if hasattr(req, "to_dict"):
            serialized.append(req.to_dict())
        else:
            # Fallback for unexpected types
            serialized.append({
                "id": getattr(req, "id", None),
                "needs_user_input": getattr(req, "needs_user_input", False),
                "needs_confirmation": getattr(req, "needs_confirmation", False),
            })

    logger.debug(f"Serialized {len(serialized)} requirements")
    return serialized


def deserialize_requirements(requirements_data: list[dict[str, Any]]) -> list:
    """
    Deserialize JSON requirements back to Agno RunRequirement objects.
    """
    from agno.run.requirement import RunRequirement

    requirements = []
    for req_data in requirements_data:
        try:
            if isinstance(req_data, dict):
                requirements.append(RunRequirement.from_dict(req_data))
            else:
                logger.warning(f"Unexpected requirement data type: {type(req_data)}")
        except Exception as e:
            logger.error(f"Failed to deserialize requirement: {e}")

    logger.debug(f"Deserialized {len(requirements)} requirements")
    return requirements


def extract_form_fields_for_frontend(tool_args: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extract form fields from interactive_form tool arguments for frontend rendering.

    This maintains the original format expected by the frontend InteractiveForm component.
    """
    fields = tool_args.get("fields", [])

    return [
        {
            "name": field.get("name"),
            "type": field.get("type", "text"),
            "label": field.get("label", field.get("name")),
            "placeholder": field.get("placeholder", ""),
            "required": field.get("required", True),
            "value": field.get("value")
        }
        for field in fields
    ]

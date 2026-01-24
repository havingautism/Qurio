"""
Prompt templates for research and deep research services.
"""

from .research_plan_prompts import (
    GENERAL_PLANNER_PROMPT,
    ACADEMIC_PLANNER_PROMPT,
)

from .deep_research_prompts import (
    GENERAL_FINAL_REPORT_PROMPT,
    ACADEMIC_FINAL_REPORT_PROMPT,
    GENERAL_STEP_AGENT_PROMPT,
    ACADEMIC_STEP_AGENT_PROMPT,
)

__all__ = [
    "GENERAL_PLANNER_PROMPT",
    "ACADEMIC_PLANNER_PROMPT",
    "GENERAL_FINAL_REPORT_PROMPT",
    "ACADEMIC_FINAL_REPORT_PROMPT",
    "GENERAL_STEP_AGENT_PROMPT",
    "ACADEMIC_STEP_AGENT_PROMPT",
]

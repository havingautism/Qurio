"""
Qurio Backend - AgentOS (Agno SDK).
"""

from .services.agent_os_app import get_agent_os

agent_os = get_agent_os()
app = agent_os.get_app()


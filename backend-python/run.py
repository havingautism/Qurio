#!/usr/bin/env python3
"""
Run script for Qurio Python backend.
Starts the FastAPI server with uvicorn.
"""

import os
import uvicorn

from src.config import get_settings

settings = get_settings()

# Enable Agno debug mode if requested
debug_agno = os.environ.get("DEBUG_AGNO", "0") == "1"
if debug_agno:
    import sys
    print(f"[DEBUG] DEBUG_AGNO enabled", file=sys.stderr)

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="debug" if debug_agno else "info",
    )

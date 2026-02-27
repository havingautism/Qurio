import asyncio
import os
import subprocess
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from loguru import logger

router = APIRouter(prefix="/env", tags=["Environment"])

@router.get("/status")
async def get_env_status():
    """
    Check if the scraper engine (Playwright Chromium) is installed.
    """
    try:
        # We try to import playwright and check for chromium existence
        # A simple way is to check the expected cache directory or run a quick check
        # For simplicity, we can also just rely on x-reader's failure, 
        # but here we'll try a basic 'cli' check
        process = await asyncio.create_subprocess_exec(
            "playwright", "install", "--help",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        return {"status": "ok", "playwright_installed": True}
    except Exception as e:
        return {"status": "error", "message": str(e), "playwright_installed": False}

@router.post("/install-browsers")
async def install_browsers():
    """
    Triggers 'playwright install chromium' asynchronously.
    """
    try:
        logger.info("[Env] Triggering playwright install chromium...")
        
        # We use uv run if available, otherwise direct playwright
        cmd = ["playwright", "install", "chromium"]
        # Check if we are in uv environment
        if os.path.exists(".venv") or os.environ.get("VIRTUAL_ENV"):
            # Try to find which command works best
            pass

        # Use asyncio to keep it non-blocking
        process = await asyncio.create_subprocess_exec(
            "python", "-m", "playwright", "install", "chromium",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        # Wait for completion (Real-time progress could be added via SSE later)
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            logger.info("[Env] Scraper engine installed successfully.")
            return {"status": "success", "message": "Scraper engine installed successfully."}
        else:
            err_msg = stderr.decode()
            logger.error("[Env] Scraper engine installation failed: %s", err_msg)
            raise HTTPException(status_code=500, detail=f"Installation failed: {err_msg}")
            
    except Exception as e:
        logger.error("[Env] Error during browser installation: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

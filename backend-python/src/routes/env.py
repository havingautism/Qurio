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
    Check if the scraper engine (Playwright Chromium) is installed by finding its path.
    """
    try:
        from playwright.async_api import async_playwright

        chromium_found = False
        try:
            async with async_playwright() as p:
                exec_path = p.chromium.executable_path
                if exec_path and os.path.exists(exec_path):
                    chromium_found = True
                    logger.info(f"[Env] Chromium found at: {exec_path}")
                else:
                    logger.warning(f"[Env] Chromium executable not found at: {exec_path}")
        except Exception as inner_e:
            logger.warning(f"[Env] Chromium check failed: {inner_e}")

        return {
            "status": "ok" if chromium_found else "error",
            "chromium_installed": chromium_found,
            "message": None if chromium_found else "Chromium browser not installed. Please run /api/env/install-browsers"
        }
    except ImportError:
        return {"status": "error", "chromium_installed": False,
                "message": "Playwright module not installed"}
    except Exception as e:
        return {"status": "error", "message": str(e), "chromium_installed": False}

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

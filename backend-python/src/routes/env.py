import asyncio
import os
import shutil
import sys

from fastapi import APIRouter, HTTPException
from loguru import logger

router = APIRouter(prefix="/env", tags=["Environment"])


async def _run_subprocess(*args: str) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    return process.returncode, stdout.decode(), stderr.decode()

@router.get("/status")
async def get_env_status():
    """
    Check if the scraper engine (Playwright Chromium) is installed by finding its path.
    """
    try:
        from playwright.async_api import async_playwright
        playwright_installed = True

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
            "playwright_installed": playwright_installed,
            "chromium_installed": chromium_found,
            "message": None if chromium_found else "Chromium browser not installed. Please run /api/env/install-browsers"
        }
    except ImportError:
        return {"status": "error", "playwright_installed": False, "chromium_installed": False,
                "message": "Playwright module not installed"}
    except Exception as e:
        return {"status": "error", "message": str(e), "playwright_installed": False, "chromium_installed": False}

@router.post("/install-browsers")
async def install_browsers():
    """
    Triggers 'playwright install chromium' asynchronously.
    """
    try:
        logger.info("[Env] Triggering playwright install chromium...")
        python_executable = sys.executable or "python"

        try:
            import playwright  # noqa: F401
        except ImportError:
            logger.info("[Env] Playwright module missing. Installing into current backend environment...")
            uv_executable = shutil.which("uv")
            if uv_executable:
                install_code, _, install_stderr = await _run_subprocess(
                    uv_executable,
                    "pip",
                    "install",
                    "--python",
                    python_executable,
                    "playwright",
                )
            else:
                install_code, _, install_stderr = await _run_subprocess(
                    python_executable,
                    "-m",
                    "pip",
                    "install",
                    "playwright",
                )
            if install_code != 0:
                logger.error("[Env] Playwright package installation failed: %s", install_stderr)
                raise HTTPException(
                    status_code=500,
                    detail=f"Playwright package installation failed: {install_stderr}",
                )

        install_code, _, install_stderr = await _run_subprocess(
            python_executable,
            "-m",
            "playwright",
            "install",
            "chromium",
        )

        if install_code == 0:
            logger.info("[Env] Scraper engine installed successfully.")
            return {"status": "success", "message": "Scraper engine installed successfully."}

        logger.error("[Env] Scraper engine installation failed: %s", install_stderr)
        raise HTTPException(status_code=500, detail=f"Installation failed: {install_stderr}")

    except Exception as e:
        logger.error("[Env] Error during browser installation: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

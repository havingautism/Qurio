"""
Shared helpers for skill-scoped virtual environments and dependency installation.
"""

from __future__ import annotations

import asyncio
import os
import re
import shutil
import sys
from typing import Any


def get_skills_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "..", "..", ".skills")


def get_skill_path(skill_id: str) -> str:
    skill_path = os.path.join(get_skills_dir(), skill_id)
    if not os.path.isdir(skill_path):
        raise FileNotFoundError(f"Skill '{skill_id}' not found")
    return skill_path


def get_skill_venv_path(skill_path: str) -> str:
    return os.path.join(skill_path, ".venv")


def get_venv_python_path(venv_path: str) -> str:
    windows_path = os.path.join(venv_path, "Scripts", "python.exe")
    if os.path.exists(windows_path):
        return windows_path
    return os.path.join(venv_path, "bin", "python")


def should_skip_skill_dir(dirname: str) -> bool:
    return dirname in {".venv", "__pycache__"}


def validate_package_name(package_name: str) -> str:
    trimmed = str(package_name or "").strip()
    if not re.fullmatch(r"^[A-Za-z0-9-]+$", trimmed):
        raise ValueError("Invalid package_name. Only letters, numbers, and hyphens are allowed.")
    return trimmed


async def run_subprocess(cmd: list[str], cwd: str) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    return process.returncode, stdout.decode("utf-8", errors="replace"), stderr.decode(
        "utf-8", errors="replace"
    )


async def install_with_available_pip(
    *,
    target_python: str,
    packages: list[str],
    cwd: str,
) -> tuple[int, str, str, str]:
    commands: list[tuple[str, list[str]]] = [
        ("venv-pip", [target_python, "-m", "pip", "install", *packages]),
        (
            "host-pip-target-python",
            [sys.executable, "-m", "pip", "--python", target_python, "install", *packages],
        ),
    ]

    uv_path = shutil.which("uv")
    if uv_path:
        commands.append(
            ("uv-pip", [uv_path, "pip", "install", "--python", target_python, *packages])
        )

    attempts: list[str] = []
    for label, cmd in commands:
        code, stdout, stderr = await run_subprocess(cmd, cwd=cwd)
        if code == 0:
            return code, stdout, stderr, label
        details = stderr.strip() or stdout.strip() or f"{label} failed"
        attempts.append(f"{label}: {details}")

    raise RuntimeError(
        "Dependency installation failed for the isolated environment. Attempts: "
        + " | ".join(attempts)
    )


async def run_subprocess_with_timeout(
    cmd: list[str],
    cwd: str,
    timeout_seconds: float = 60.0,
) -> tuple[int, str, str]:
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError(f"Script execution timed out after {timeout_seconds:.1f}s")
    return process.returncode, stdout.decode("utf-8", errors="replace"), stderr.decode(
        "utf-8", errors="replace"
    )


async def ensure_skill_venv(skill_path: str) -> tuple[str, bool]:
    venv_path = get_skill_venv_path(skill_path)
    python_path = get_venv_python_path(venv_path)
    if os.path.exists(python_path):
        return python_path, False

    os.makedirs(skill_path, exist_ok=True)
    code, _, stderr = await run_subprocess([sys.executable, "-m", "venv", venv_path], cwd=skill_path)
    if code != 0:
        raise RuntimeError(f"Failed to create isolated environment: {stderr.strip() or 'unknown error'}")

    python_path = get_venv_python_path(venv_path)
    if not os.path.exists(python_path):
        raise RuntimeError("Virtual environment was created without a Python executable")

    return python_path, True


def get_skill_environment_status(skill_id: str) -> dict[str, Any]:
    skill_path = get_skill_path(skill_id)
    venv_path = get_skill_venv_path(skill_path)
    python_path = get_venv_python_path(venv_path)
    python_exists = os.path.exists(python_path)
    return {
        "skill_id": skill_id,
        "venv_exists": python_exists,
        "python_path": python_path if python_exists else None,
        "scripts_dir_exists": os.path.isdir(os.path.join(skill_path, "scripts")),
    }


async def install_skill_dependency(skill_id: str, package_name: str) -> dict[str, Any]:
    skill_path = get_skill_path(skill_id)
    validated_package = validate_package_name(package_name)
    python_path, created = await ensure_skill_venv(skill_path)
    code, stdout, stderr, installer = await install_with_available_pip(
        target_python=python_path,
        packages=[validated_package],
        cwd=skill_path,
    )

    return {
        "success": True,
        "skill_id": skill_id,
        "package_name": validated_package,
        "venv_created": created,
        "python_path": python_path,
        "installer": installer,
        "stdout": stdout.strip(),
    }


def resolve_skill_script_path(skill_id: str, script_path: str) -> tuple[str, str]:
    skill_path = get_skill_path(skill_id)
    normalized_rel = str(script_path or "").strip().replace("\\", "/")
    if not normalized_rel:
        raise ValueError("script_path is required")
    abs_path = os.path.abspath(os.path.join(skill_path, normalized_rel))
    scripts_root = os.path.abspath(os.path.join(skill_path, "scripts"))
    if not abs_path.startswith(scripts_root + os.sep) and abs_path != scripts_root:
        raise ValueError("script_path must stay inside the skill's scripts directory")
    if not os.path.isfile(abs_path):
        raise FileNotFoundError(f"Script '{normalized_rel}' not found in skill '{skill_id}'")
    return skill_path, abs_path


def build_skill_script_command(skill_id: str, script_path: str, args: list[str] | None = None) -> tuple[str, list[str]]:
    skill_path, abs_path = resolve_skill_script_path(skill_id, script_path)
    ext = os.path.splitext(abs_path)[1].lower()
    cmd_args = [str(a) for a in (args or [])]
    venv_python = get_venv_python_path(get_skill_venv_path(skill_path))

    if ext == ".py":
        python_cmd = venv_python if os.path.exists(venv_python) else sys.executable
        return skill_path, [python_cmd, abs_path, *cmd_args]
    if ext in {".sh", ".bash"}:
        return skill_path, ["bash", abs_path, *cmd_args]

    with open(abs_path, "r", encoding="utf-8", errors="ignore") as handle:
        first_line = handle.readline().strip()

    if "python" in first_line:
        python_cmd = venv_python if os.path.exists(venv_python) else sys.executable
        return skill_path, [python_cmd, abs_path, *cmd_args]
    if "bash" in first_line or "sh" in first_line:
        return skill_path, ["bash", abs_path, *cmd_args]

    return skill_path, [abs_path, *cmd_args]


async def execute_skill_script(
    skill_id: str,
    script_path: str,
    args: list[str] | None = None,
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    skill_path, cmd = build_skill_script_command(skill_id, script_path, args)
    code, stdout, stderr = await run_subprocess_with_timeout(cmd, cwd=skill_path, timeout_seconds=timeout_seconds)
    return {
        "success": code == 0,
        "skill_id": skill_id,
        "script_path": script_path,
        "args": [str(a) for a in (args or [])],
        "command": cmd,
        "exit_code": code,
        "stdout": stdout.strip(),
        "stderr": stderr.strip(),
    }

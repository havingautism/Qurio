import os
import re
import shutil
import tempfile
import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from urllib.parse import urlparse
from ..services.skill_runtime import (
    ensure_skill_venv,
    get_skill_environment_status,
    get_skill_path,
    get_skill_venv_path,
    get_venv_python_path,
    install_skill_dependency as install_skill_dependency_runtime,
    run_subprocess,
    should_skip_skill_dir,
    validate_package_name,
)

router = APIRouter(prefix="/skills", tags=["skills"])

# Path to the internal skill-creator skill bundled with the backend source
_INTERNAL_SKILLS_DIR = Path(__file__).parent.parent / "_internal_skills"

class SkillInfo(BaseModel):
    id: str
    name: str
    description: str

class SkillCreate(BaseModel):
    id: str
    name: str
    description: str
    instructions: str

class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    instructions: str | None = None

class SkillFileContent(BaseModel):
    path: str
    content: str


class SkillEnvironmentStatus(BaseModel):
    skill_id: str
    venv_exists: bool
    python_path: str | None = None
    scripts_dir_exists: bool


class SkillDependencyInstall(BaseModel):
    package_name: str


class SkillImportGitRequest(BaseModel):
    repo_url: str
    skill_path: str | None = None
    skill_id: str | None = None
    ref: str | None = None


def _get_skills_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "..", "..", ".skills")


def _get_skill_path(skill_id: str) -> str:
    try:
        return get_skill_path(skill_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Skill not found")


def _get_skill_venv_path(skill_path: str) -> str:
    return get_skill_venv_path(skill_path)


def _get_venv_python_path(venv_path: str) -> str:
    return get_venv_python_path(venv_path)


def _should_skip_skill_dir(dirname: str) -> bool:
    return should_skip_skill_dir(dirname)


async def _run_subprocess(cmd: list[str], cwd: str) -> tuple[int, str, str]:
    return await run_subprocess(cmd, cwd)


async def _ensure_skill_venv(skill_path: str) -> tuple[str, bool]:
    try:
        return await ensure_skill_venv(skill_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _sanitize_skill_id(raw: str) -> str:
    skill_id = (raw or "").strip().lower()
    skill_id = re.sub(r"[^a-z0-9-]", "-", skill_id)
    skill_id = re.sub(r"-+", "-", skill_id).strip("-")
    return skill_id[:64]


def _is_allowed_git_repo_url(repo_url: str) -> bool:
    parsed = urlparse((repo_url or "").strip())
    if parsed.scheme in {"http", "https"}:
        return bool(parsed.netloc and parsed.path)
    if parsed.scheme == "ssh":
        return bool(parsed.netloc and parsed.path)
    return bool(re.match(r"^[^@\s]+@[^:\s]+:[^\s]+$", repo_url or ""))


def _normalize_git_import_source(
    repo_url: str,
    skill_path: str | None,
    ref: str | None,
) -> tuple[str, str | None, str | None]:
    """
    Allow pasting GitHub tree/blob URLs directly, e.g.
    https://github.com/<owner>/<repo>/tree/<ref>/<path>
    """
    raw = (repo_url or "").strip()
    parsed = urlparse(raw)
    host = (parsed.netloc or "").lower()
    if host.startswith("www."):
        host = host[4:]

    if host != "github.com":
        return raw, skill_path, ref

    segments = [seg for seg in parsed.path.split("/") if seg]
    # Expect: owner/repo/(tree|blob)/ref/[path...]
    if len(segments) >= 4 and segments[2] in {"tree", "blob"}:
        owner, repo = segments[0], segments[1]
        extracted_ref = segments[3]
        extracted_path = "/".join(segments[4:]) if len(segments) > 4 else "."
        normalized_repo = f"https://github.com/{owner}/{repo}.git"
        final_ref = (ref or "").strip() or extracted_ref
        final_path = (skill_path or "").strip() or extracted_path
        return normalized_repo, final_path, final_ref

    return raw, skill_path, ref


def _normalize_skill_subpath(skill_path: str | None) -> str:
    if not skill_path:
        return "."
    cleaned = str(skill_path).strip().replace("\\", "/").strip("/")
    if not cleaned:
        return "."
    if ".." in cleaned.split("/"):
        raise HTTPException(status_code=400, detail="skill_path cannot contain '..'")
    return cleaned


def _parse_and_validate_skill_md(content: str) -> tuple[dict, str]:
    """
    Validate SKILL.md against the Agno-compatible format used by this app:
    - Must start with YAML frontmatter (`--- ... ---`)
    - Frontmatter must contain `name` and `description`
    - `name` must match ^[a-z0-9-]+$
    """
    if not content.startswith("---"):
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: missing YAML frontmatter. Expected leading '---'.",
        )

    parts = content.split("---", 2)
    if len(parts) < 3:
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: malformed YAML frontmatter block.",
        )

    metadata = yaml.safe_load(parts[1]) or {}
    if not isinstance(metadata, dict):
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: frontmatter must be a YAML object.",
        )

    name = str(metadata.get("name") or "").strip()
    description = str(metadata.get("description") or "").strip()
    if not name:
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: frontmatter field 'name' is required.",
        )
    if not re.fullmatch(r"^[a-z0-9-]+$", name):
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: 'name' must be lowercase alphanumeric with hyphens only.",
        )
    if not description:
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: frontmatter field 'description' is required.",
        )

    instructions = parts[2].lstrip("\n")
    if not instructions.strip():
        raise HTTPException(
            status_code=400,
            detail="Invalid SKILL.md: instructions body cannot be empty.",
        )

    return {"name": name, "description": description}, instructions

@router.get("", response_model=list[SkillInfo])
async def list_skills():
    """Returns a list of all currently locally installed skills by parsing SKILL.md files."""
    skills_dir = _get_skills_dir()
    skills = []

    if not os.path.exists(skills_dir):
        return skills

    for item in os.listdir(skills_dir):
        skill_path = os.path.join(skills_dir, item)
        if os.path.isdir(skill_path):
            md_path = os.path.join(skill_path, "SKILL.md")
            if os.path.exists(md_path):
                # Parse the YAML frontmatter
                try:
                    with open(md_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        
                    if content.startswith("---"):
                        # Extract the YAML block between the first two '---' markers
                        parts = content.split("---", 2)
                        if len(parts) >= 3:
                            frontmatter = parts[1]
                            metadata = yaml.safe_load(frontmatter) or {}
                            
                            skills.append(SkillInfo(
                                id=item,
                                name=metadata.get("name") or item,
                                description=metadata.get("description", "No description available.")
                            ))
                except Exception as e:
                    # Silently skip malformed skills in listing
                    print(f"Error parsing skill metadata for {item}: {e}")
                    pass
    
    # Sort skills alphabetically by name
    return sorted(skills, key=lambda s: s.name.lower())

@router.post("", response_model=SkillInfo)
async def create_skill(skill: SkillCreate):
    """Create a new skill in the .skills directory."""
    import re
    import shutil
    
    # Validate ID strictly according to Agno rules
    if not re.match(r"^[a-z0-9-]+$", skill.id):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Skill ID must be lowercase, alphanumeric, and hyphens only.")
        
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill.id)
    
    md_path = os.path.join(skill_path, "SKILL.md")
    if os.path.exists(md_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=409, detail=f"Skill '{skill.id}' already exists.")
        
    os.makedirs(skill_path, exist_ok=True)
    os.makedirs(os.path.join(skill_path, "scripts"), exist_ok=True)
    os.makedirs(os.path.join(skill_path, "references"), exist_ok=True)
    
    # Agno requires 'name' to match the directory name and be lowercase/alphanumeric/hyphenated.
    md_content = f"---\nname: {skill.id}\ndescription: {skill.description}\n---\n\n{skill.instructions}"
    
    md_path = os.path.join(skill_path, "SKILL.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    return SkillInfo(id=skill.id, name=skill.name or skill.id, description=skill.description)


@router.post("/import/git", response_model=SkillInfo)
async def import_skill_from_git(req: SkillImportGitRequest):
    """Import a skill from a third-party git repository."""
    repo_url, auto_skill_path, auto_ref = _normalize_git_import_source(
        req.repo_url,
        req.skill_path,
        req.ref,
    )
    repo_url = (repo_url or "").strip()
    if not repo_url:
        raise HTTPException(status_code=400, detail="repo_url is required")
    if not _is_allowed_git_repo_url(repo_url):
        raise HTTPException(status_code=400, detail="Unsupported repo_url format")

    skill_subpath = _normalize_skill_subpath(auto_skill_path)
    ref = (auto_ref or "").strip()
    if ref and not re.fullmatch(r"[A-Za-z0-9._/\-]+", ref):
        raise HTTPException(status_code=400, detail="Invalid ref format")

    skills_dir = _get_skills_dir()
    os.makedirs(skills_dir, exist_ok=True)

    tmp_root = tempfile.mkdtemp(prefix="skill-import-", dir=skills_dir)
    try:
        clone_cmd = ["git", "clone", "--depth", "1"]
        if ref:
            clone_cmd.extend(["--branch", ref])
        clone_cmd.extend([repo_url, tmp_root])

        try:
            code, _, stderr = await _run_subprocess(clone_cmd, cwd=skills_dir)
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail="Git is not installed on the server")
        if code != 0:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to clone repository: {stderr.strip() or 'unknown error'}",
            )

        src_path = os.path.abspath(os.path.join(tmp_root, skill_subpath))
        tmp_root_abs = os.path.abspath(tmp_root)
        if not src_path.startswith(tmp_root_abs + os.sep) and src_path != tmp_root_abs:
            raise HTTPException(status_code=400, detail="Invalid skill_path")
        if not os.path.isdir(src_path):
            raise HTTPException(status_code=400, detail="skill_path not found in repository")

        skill_md = os.path.join(src_path, "SKILL.md")
        if not os.path.isfile(skill_md):
            raise HTTPException(status_code=400, detail="SKILL.md not found under skill_path")

        parsed_name = ""
        try:
            with open(skill_md, "r", encoding="utf-8") as f:
                content = f.read()
            if content.startswith("---"):
                parts = content.split("---", 2)
                if len(parts) >= 3:
                    metadata = yaml.safe_load(parts[1]) or {}
                    parsed_name = str(metadata.get("name") or "").strip()
        except Exception:
            parsed_name = ""

        candidate_id = req.skill_id or parsed_name or os.path.basename(src_path) or "imported-skill"
        skill_id = _sanitize_skill_id(candidate_id)
        if not skill_id:
            raise HTTPException(status_code=400, detail="Could not derive a valid skill_id")

        target_path = os.path.join(skills_dir, skill_id)
        if os.path.exists(target_path):
            raise HTTPException(status_code=409, detail=f"Skill '{skill_id}' already exists.")

        def _ignore_copy(_dir: str, names: list[str]) -> set[str]:
            ignored = {".git", ".venv", "__pycache__"}
            return {n for n in names if n in ignored}

        shutil.copytree(src_path, target_path, ignore=_ignore_copy)

        imported_md = os.path.join(target_path, "SKILL.md")
        if not os.path.isfile(imported_md):
            shutil.rmtree(target_path, ignore_errors=True)
            raise HTTPException(status_code=400, detail="Imported folder does not contain SKILL.md")

        name = skill_id
        description = "Imported from git repository."
        try:
            with open(imported_md, "r", encoding="utf-8") as f:
                imported_content = f.read()
            metadata, instructions = _parse_and_validate_skill_md(imported_content)
            description = metadata["description"]
            # Force name to match directory id for Agno compatibility in this app.
            normalized_frontmatter = yaml.safe_dump(
                {"name": skill_id, "description": description},
                allow_unicode=True,
                sort_keys=False,
            ).strip()
            normalized_content = f"---\n{normalized_frontmatter}\n---\n\n{instructions}"
            with open(imported_md, "w", encoding="utf-8") as f:
                f.write(normalized_content)
            name = skill_id
        except Exception:
            shutil.rmtree(target_path, ignore_errors=True)
            raise

        return SkillInfo(id=skill_id, name=name, description=description)
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)

@router.get("/{skill_id}")
async def get_skill(skill_id: str):
    """Get full details (including instructions) of a specific skill."""
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
    md_path = os.path.join(skill_path, "SKILL.md")
    
    if not os.path.exists(md_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Skill not found")
        
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    parts = content.split("---", 2)
    instructions = parts[2].strip() if len(parts) >= 3 else content
    
    # Extract metadata to get description
    description = ""
    if len(parts) >= 3:
        try:
            metadata = yaml.safe_load(parts[1]) or {}
            description = metadata.get("description", "")
        except:
            pass
            
    # Defaults based on existing
    current_name = skill_id
    current_desc = ""
    
    if len(parts) >= 3:
        try:
            metadata = yaml.safe_load(parts[1]) or {}
            current_name = metadata.get("name") or skill_id
            current_desc = metadata.get("description", "")
        except:
            pass
            
    return {
        "id": skill_id,
        "name": current_name,
        "description": current_desc,
        "instructions": instructions
    }

@router.get("/{skill_id}/files")
async def list_skill_files(skill_id: str):
    """List all files in a skill's directory (excluding SKILL.md)."""
    skill_path = _get_skill_path(skill_id)
        
    files = []
    for root, dirnames, filenames in os.walk(skill_path):
        dirnames[:] = [d for d in dirnames if not _should_skip_skill_dir(d)]
        rel_root = os.path.relpath(root, skill_path)
        if rel_root != "." and any(_should_skip_skill_dir(part) for part in rel_root.split(os.sep)):
            continue
        for filename in filenames:
            if filename == "SKILL.md":
                continue
            abs_path = os.path.join(root, filename)
            rel_path = os.path.relpath(abs_path, skill_path)
            files.append(rel_path)
            
    return {"files": sorted(files)}

@router.get("/{skill_id}/file")
async def get_skill_file(skill_id: str, path: str):
    """Get content of a specific file in a skill."""
    skill_path = _get_skill_path(skill_id)
    file_path = os.path.abspath(os.path.join(skill_path, path))
    
    if not file_path.startswith(os.path.abspath(skill_path)):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid path")
        
    if not os.path.exists(file_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
        
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    return {"content": content}

@router.put("/{skill_id}/file")
async def update_skill_file(skill_id: str, file_data: SkillFileContent):
    """Create or update a file in a skill."""
    skill_path = _get_skill_path(skill_id)
    file_path = os.path.abspath(os.path.join(skill_path, file_data.path))
    
    if not file_path.startswith(os.path.abspath(skill_path)):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid path")
        
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(file_data.content)
        
    return {"success": True}

@router.delete("/{skill_id}/file")
async def delete_skill_file(skill_id: str, path: str):
    """Delete a file in a skill."""
    skill_path = _get_skill_path(skill_id)
    file_path = os.path.abspath(os.path.join(skill_path, path))
    
    if not file_path.startswith(os.path.abspath(skill_path)):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid path")
        
    if not os.path.exists(file_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")
        
    os.remove(file_path)
    return {"success": True}

@router.put("/{skill_id}", response_model=SkillInfo)
async def update_skill(skill_id: str, update: SkillUpdate):
    """Update an existing skill."""
    skill_path = _get_skill_path(skill_id)
    md_path = os.path.join(skill_path, "SKILL.md")
        
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    parts = content.split("---", 2)
    
    # Defaults based on existing
    current_name = skill_id
    current_desc = ""
    current_inst = parts[2].strip() if len(parts) >= 3 else content
    
    if len(parts) >= 3:
        try:
            metadata = yaml.safe_load(parts[1]) or {}
            current_desc = metadata.get("description", "")
        except:
            pass
            
    new_desc = update.description if update.description is not None else current_desc
    new_inst = update.instructions if update.instructions is not None else current_inst
    
    # Force name to match skill_id for Agno compatibility
    md_content = f"---\nname: {skill_id}\ndescription: {new_desc}\n---\n\n{new_inst}"
    
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    return SkillInfo(id=skill_id, name=skill_id, description=new_desc)

@router.delete("/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete a skill."""
    import shutil
    skill_path = _get_skill_path(skill_id)
        
    shutil.rmtree(skill_path)
    return {"success": True}


@router.get("/{skill_id}/environment", response_model=SkillEnvironmentStatus)
async def get_skill_environment(skill_id: str):
    """Return isolated runtime status for a skill."""
    try:
        status = get_skill_environment_status(skill_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Skill not found")
    return SkillEnvironmentStatus(**status)


@router.post("/{skill_id}/dependencies/install")
async def install_skill_dependency(skill_id: str, req: SkillDependencyInstall):
    """
    Install a single dependency into a skill-scoped virtual environment.

    This is intentionally narrower than exposing a raw shell tool:
    only one package is accepted, the package name is validated, and
    installation is restricted to `.skills/<skill_id>/.venv`.
    """
    try:
        validate_package_name(req.package_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        return await install_skill_dependency_runtime(skill_id, req.package_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Skill not found")
    except RuntimeError as exc:
        raise HTTPException(
            status_code=500,
            detail={"message": f"Failed to install dependency '{req.package_name}'", "stderr": str(exc)},
        )


# ─────────────────────────────────────────────
# Skill Creator: AI-powered skill generation
# ─────────────────────────────────────────────

class SkillGenerate(BaseModel):
    """Request body for AI-powered skill generation."""
    prompt: str                       # Natural language description of the desired skill
    skill_id: str | None = None      # Optional; generated by LLM if omitted
    provider: str = "openai"
    api_key: str
    base_url: str | None = None
    model: str | None = None


@router.post("/generate")
async def generate_skill(req: SkillGenerate):
    """
    Spin up a Skill Builder Agent with FileTools + the internal skill-creator skill,
    let it autonomously generate SKILL.md / scripts/*.py / references/*.md,
    and return the list of created files.
    """
    from agno.agent import Agent
    from agno.tools.file import FileTools
    from agno.skills import LocalSkills
    from ..services.agent_registry import _build_model

    # ── 1. Validate / derive skill_id ────────────────────────────────────────
    skill_id = req.skill_id or ""
    if not skill_id:
        # Let the LLM pick one; we'll parse it from the generated SKILL.md later.
        # For now generate a safe placeholder that the agent will overwrite.
        import uuid
        skill_id = f"skill-{uuid.uuid4().hex[:8]}"

    skill_id = skill_id.lower()
    skill_id = re.sub(r"[^a-z0-9-]", "-", skill_id)
    skill_id = re.sub(r"-+", "-", skill_id).strip("-")[:64]

    if not re.match(r"^[a-z0-9-]+$", skill_id):
        raise HTTPException(status_code=400, detail="Invalid skill_id format")

    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)

    if os.path.exists(os.path.join(skill_path, "SKILL.md")):
        raise HTTPException(status_code=409, detail=f"Skill '{skill_id}' already exists")

    # ── 2. Create the target directory ───────────────────────────────────────
    os.makedirs(skill_path, exist_ok=True)

    # ── 3. Build the Skill Builder Agent ─────────────────────────────────────
    model = _build_model(req.provider, req.api_key, req.base_url, req.model)

    # FileTools: sandboxed to the new skill directory — agent cannot escape it.
    # enable_delete_file=False prevents the agent from destroying its own work.
    file_tools = FileTools(
        base_dir=Path(skill_path),
        enable_save_file=True,
        enable_read_file=True,
        enable_list_files=True,
        enable_delete_file=False,
    )

    # LocalSkills: load the internal skill-creator skill so the agent has
    # Anthropics-quality meta-knowledge on how to write good Agno skills.
    internal_skill_dir = str(_INTERNAL_SKILLS_DIR / "skill-creator")
    skills = None
    if os.path.isdir(internal_skill_dir):
        from agno.skills import Skills
        skills = Skills(loaders=[LocalSkills(internal_skill_dir)])

    system_prompt = f"""You are a Skill architect for the Agno AI framework.
Create a complete, production-quality Skill package based on the user's description below.

You have FileTools available. Your working directory is the skill root folder.
DO NOT create a new subdirectory for the skill. Write all files strictly to the current directory (`.`).
ONLY write files at these paths:
  - SKILL.md  (REQUIRED)
  - scripts/<filename>.py  (optional — MUST include `#!/usr/bin/env python3` at the top)
  - scripts/<filename>.sh  (optional — MUST include `#!/bin/bash` at the top)
  - references/<filename>.md  (optional — only if supplementary docs add value)

CRITICAL WORKFLOW - YOU MUST FOLLOW THESE EXACT STEPS IN ORDER:
1. FIRST, write the initial `SKILL.md` file.
2. SECOND, write ANY required files in `scripts/` and `references/`.
3. THIRD, if you created ANY scripts or references in step 2, you MUST read and rewrite `SKILL.md` to add explicit usage instructions for those new files in the "## Setup & Usage Instructions" section.

Your `SKILL.md` MUST strictly follow this exact markdown structure (Frontmatter followed by content):

```markdown
---
name: <a-kebab-cased-cool-skill-name>
description: <trigger phrase + purpose; max 200 chars; be explicit about WHEN to use this skill>
---

# <Skill Title>

## Setup & Usage Instructions
<Provide explicit instructions here teaching the operating Agent WHEN and HOW to use the files you generated in `references/` or `scripts/`.>
<Example: "Before proceeding, YOU MUST read `references/guidelines.md`" or "Execute `scripts/voice_enhancer.py` when asked to enhance voice.">
<If you didn't create any scripts/references, explain how the base skill itself should be operated.>
<If your scripts depend on third-party Python packages, explicitly instruct the operating Agent to ask the user for approval via interactive_form before installing any missing dependency.>

## <Other Actionable Instructions...>
<Add detailed character prompt, tasks, rules, or references here>
```

**CRITICAL DIRECTIVES**:
1. DO NOT CREATE a separate usage guide in `references/`. Make sure the actual instructions are physically written INSIDE the `SKILL.md` file itself.
2. DO NOT literally copy the word "CRITICAL" or any instructions from this system prompt into the final output. Replace the placeholder segments with your ACTUAL content.
3. Replace `<Describe the Skill...>` or any placeholders with specific, actionable instructions for the Agent.


After creating all files, call list_files to confirm, then stop.
Do NOT create assets/ or any other directories except scripts/ and references/ inside the current root.

USER'S SKILL REQUEST:
{req.prompt}"""

    agent = Agent(
        model=model,
        tools=[file_tools],
        skills=skills,
        instructions=system_prompt,
        markdown=False,
    )

    # ── 4. Run the agent (non-streaming, blocking) ────────────────────────────
    try:
        agent.run(req.prompt)
    except Exception as exc:
        # Clean up the partially created directory on failure
        import shutil as _shutil
        _shutil.rmtree(skill_path, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Skill generation failed: {exc}")

    # ── 5. Post-process & Collect output ──────────────────────────────────────
    import shutil as _shutil

    # Check if the agent created files *inside* a new subdirectory under skill_path
    # (Sometimes LLMs ignore the prompt and create `skill-108b5faa/my-skill/SKILL.md`)
    # If the root SKILL.md is missing, but there is exactly one subdirectory with a SKILL.md, hoist it.
    if not os.path.exists(os.path.join(skill_path, "SKILL.md")):
        subdirs = [d for d in os.listdir(skill_path) if os.path.isdir(os.path.join(skill_path, d))]
        if len(subdirs) == 1:
            nested_dir = os.path.join(skill_path, subdirs[0])
            if os.path.exists(os.path.join(nested_dir, "SKILL.md")):
                # Hoist all contents of nested_dir to skill_path
                for item in os.listdir(nested_dir):
                    src = os.path.join(nested_dir, item)
                    dst = os.path.join(skill_path, item)
                    _shutil.move(src, dst)
                _shutil.rmtree(nested_dir, ignore_errors=True)

    # Alternatively, the LLM might have escaped and created a directory in the parent '.skills' folder.
    # We can fetch the real name defined in SKILL.md and rename if necessary.
    real_skill_id = skill_id
    md_path = os.path.join(skill_path, "SKILL.md")
    
    # If SKILL.md is still missing, check if it was created in a sibling directory (by looking at recently created logic)
    # However, doing this safely is complex. If it completely failed to create it here, we will raise an error.
    if not os.path.exists(md_path):
        _shutil.rmtree(skill_path, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail="Agent did not produce a SKILL.md in the correct directory. Please try again."
        )

    # Extrat the actual ID the LLM put in SKILL.md YAML
    try:
        with open(md_path, "r", encoding="utf-8") as f:
            content = f.read()
        parts = content.split("---", 2)
        if len(parts) >= 3:
            metadata = yaml.safe_load(parts[1]) or {}
            if "name" in metadata and isinstance(metadata["name"], str):
                parsed_name = metadata["name"].strip()
                parsed_name = re.sub(r"[^a-z0-9-]", "-", parsed_name.lower()).strip("-")
                if parsed_name and parsed_name != skill_id:
                    target_path = os.path.join(skills_dir, parsed_name)
                    if not os.path.exists(target_path):
                        # Rename the directory to the nice name
                        os.rename(skill_path, target_path)
                        skill_path = target_path
                        real_skill_id = parsed_name
                        
                        # rewrite the name inside SKILL.md to match safety requirements
                        metadata["name"] = real_skill_id
                        new_md_content = f"---\n{yaml.dump(metadata, sort_keys=False, allow_unicode=True).strip()}\n---\n{parts[2]}"
                        with open(os.path.join(skill_path, "SKILL.md"), "w", encoding="utf-8") as f:
                            f.write(new_md_content)
    except Exception as e:
        print(f"Warning: could not parse/rename generated skill: {e}")

    files_created: list[str] = []
    for root, dirnames, filenames in os.walk(skill_path):
        dirnames[:] = [d for d in dirnames if not _should_skip_skill_dir(d)]
        rel_root = os.path.relpath(root, skill_path)
        if rel_root != "." and any(_should_skip_skill_dir(part) for part in rel_root.split(os.sep)):
            continue
        for fname in filenames:
            abs_path = os.path.join(root, fname)
            rel_path = os.path.relpath(abs_path, skill_path)
            files_created.append(rel_path)

    return {"skill_id": real_skill_id, "files_created": sorted(files_created)}

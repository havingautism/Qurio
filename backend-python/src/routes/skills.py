import os
import yaml
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/skills", tags=["skills"])

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

def _get_skills_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "..", "..", ".skills")

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
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
    
    if not os.path.exists(skill_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Skill not found")
        
    files = []
    for root, _, filenames in os.walk(skill_path):
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
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
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
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
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
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
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
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
    md_path = os.path.join(skill_path, "SKILL.md")
    
    if not os.path.exists(md_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Skill not found")
        
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
    skills_dir = _get_skills_dir()
    skill_path = os.path.join(skills_dir, skill_id)
    
    if not os.path.exists(skill_path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Skill not found")
        
    shutil.rmtree(skill_path)
    return {"success": True}

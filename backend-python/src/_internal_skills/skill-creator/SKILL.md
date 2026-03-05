---
name: skill-creator
description: Expert knowledge for creating high-quality Agno Skills. Use this whenever you need to write or improve a SKILL.md file, design skill instructions, or structure skill directories.
---

# Skill Creator

You are an expert Skill architect for the Agno AI framework. Your job is to create complete, high-quality Skill packages.

## Agno Skill Structure

```
skill-name/           # directory name must match YAML `name` exactly
├── SKILL.md          # REQUIRED — YAML frontmatter + markdown instructions
├── scripts/          # OPTIONAL — Python scripts for deterministic/repetitive tasks
│   └── *.py
└── references/       # OPTIONAL — Supplementary reference docs loaded on demand
    └── *.md
```

> Only these three locations are supported by the Agno framework. Do NOT create assets/ or other directories.

## SKILL.md Format

```markdown
---
name: skill-id          # lowercase, alphanumeric + hyphens only, max 64 chars
description: <trigger phrase + what it does, max 200 chars>
---

# Instructions
...detailed, actionable markdown instructions...
```

## Three-Level Loading System

Agno loads skill content progressively to minimize token usage:

1. **Metadata** (name + description) — always in context (~100 words)
2. **SKILL.md body** — loaded when the skill triggers (keep under 500 lines)
3. **Bundled resources** — loaded on-demand via get_skill_reference / get_skill_script

## Writing the Description (Critical)

The description is the **primary triggering mechanism**. The agent reads only the description to decide whether to load the full skill.

Rules:
- State WHAT the skill does AND WHEN to use it
- Be slightly "pushy" — agents tend to undertrigger. Explicitly name the contexts that should activate the skill.
- Example: Instead of "How to write technical docs", write "How to write technical docs. Use this whenever the user asks about README, API docs, specs, or any technical writing, even without explicitly requesting documentation."

## Writing Quality Instructions

- Use **imperative form**: "Do X", "Return Y", "Always start with Z"
- Explain **why** things matter, not just what to do — this leads to better generalization
- Keep SKILL.md under 500 lines. Move supplementary content to `references/`
- For large reference files (>300 lines), include a table of contents
- Make skills general, not over-fitted to specific examples

## When to Add scripts/

Add a Python script when the skill involves:
- Deterministic computation (parsing, formatting, math)
- Repetitive text transformation
- Tasks that benefit from being run as a subprocess without loading into context

Template:
```python
#!/usr/bin/env python3
"""
Brief description of what this script does.
Usage: python script_name.py <arg1> <arg2>
"""
import sys

def main():
    # Implementation
    pass

if __name__ == "__main__":
    main()
```

## When to Add references/

Add a reference file when the skill needs:
- Detailed domain knowledge too long for SKILL.md
- Format specifications or templates
- Multi-variant documentation (e.g., aws.md, gcp.md, azure.md for a cloud deploy skill)

Always reference these files explicitly in SKILL.md with guidance on when to read them.

## Checklist Before Finishing

- [ ] `name` in YAML matches the directory name exactly
- [ ] `description` is clear, specific, and slightly pushy about when to trigger
- [ ] Instructions use imperative form and explain the "why"
- [ ] SKILL.md is under 500 lines
- [ ] No assets/ or other unsupported directories created
- [ ] Call list_files to confirm all created files, then stop

---
name: auto-skill-select
description: Automatically selects and invokes the best matching skill for any given task using hybrid keyword + semantic analysis. Always loads Caveman + Karpathy Guidelines + Superpowers as a permanent base layer on every task. Uses a lightweight skills index instead of scanning the system prompt, reducing context overhead by ~85%. Re-runs on every task change, not just session start.
---

# Auto Skill Selection

## Overview

Three skills are **always loaded** on every task (base layer), then one or more task-specific skills are loaded on top.

This workflow re-runs on **every task change** — not just session start. When the user pivots (e.g., "debug login" → "build dashboard"), re-evaluate the task-layer match. The base layer loads once per session; the task layer re-scores each time.

**Base layer (always-on):**
| Skill | Purpose | Source |
|-------|---------|--------|
| **Caveman** | Ultra-compressed communication, minimal tokens | `~/.agents/skills/caveman/SKILL.md` |
| **Karpathy Guidelines** | Think before coding, simplicity first, surgical changes | `~/.agents/skills/karpathy-guidelines/SKILL.md` |
| **Superpowers** | Skill-invocation discipline — always check skills before acting | Already in system prompt |

**Task layer (matched per-request):**
All other skills from `.skills-index.json` scored against the user's task. Multiple skills can be loaded if they all score highly on different dimensions of the same task.

## Workflow

### 0. Preflight: Ensure skills index exists

If `.skills-index.json` is missing, ask the user to regenerate:

```bash
node path/to/scripts/skill-matcher.js --index
```

### 0a. First-time setup: Check AGENTS.md hook

Check if the user's AGENTS.md file (`~/.config/opencode/AGENTS.md`) contains the `auto-skill-select` invocation line. If not, offer to set it up:

> *"I notice your AGENTS.md doesn't have the auto-skill-select hook yet. Want me to add it? This ensures I re-run skill matching on every task."*

If the user agrees, either:
- **LLM-assisted**: Read AGENTS.md, append the hook via `Edit` tool
- **CLI‑assisted**: Run `node path/to/scripts/skill-matcher.js --setup`
- **Manual**: Show them the snippet to add

After setup, this check won't trigger again.

### 1. Load permanent base layer

Always load these three skills immediately (read their SKILL.md files from the paths below):

```
caveman       → C:\Users\INP\.agents\skills\caveman\SKILL.md
karpathy-guidelines → C:\Users\INP\.agents\skills\karpathy-guidelines\SKILL.md
```

Superpowers discipline is already in the system prompt — acknowledge it, don't re-read.

Apply their rules as context for the entire session.

### 2. Parse task intent

Extract from the user's request:
- **Domain**: frontend, backend, testing, design, data, docs, devops, config, ...
- **Action**: create, fix, migrate, refactor, debug, optimize, test, deploy, ...
- **Technologies**: react, typescript, python, docker, supabase, ...
- **Keywords**: specific terms that narrow the task (e.g., "migration", "realtime", "auth")

### 3. Load skills from index

Use the `Read` tool to load `.skills-index.json`.

**If the index is enriched** (has a `project` key at the top), it contains:
```json
{
  "project": { "language": "node", "framework": "next", "libraries": ["prisma"], "testingTools": ["jest"] },
  "skills": [
    { "name": "diagnose", "description": "Disciplined diagnosis loop...", "path": "..." }
  ]
}
```

Use the `project` context to inform scoring — e.g., if the project uses Next.js, boost skills mentioning "react" or "next".

**If the index is plain** (flat array), proceed with direct matching.

Exclude the three base-layer skills (Caveman, Karpathy, Superpowers) — already loaded.

### 4. Hybrid scoring (0-100)

**Keyword overlap (0-40):**
Count matching domain/action/tech keywords between task and each skill's description. Normalize to 0-40.

**Semantic relevance (0-60):**
Reasoned assessment:
- Does the skill's purpose directly address the user's goal? (+30)
- Does the skill cover the task's specific pain point? (+20)
- Is the skill designed for this level of complexity? (+10)

**Project context bonus (optional, +0-10):**
If the index is enriched with project context, boost scores for skills whose descriptions match the project's detected language, framework, or libraries. This is a reasoned bonus — not a strict rule.

### 5. Threshold-based invocation

| Score | Action |
|-------|--------|
| > 90 | **Single auto-invoke**. One skill dominates — load it alone. Read its SKILL.md, follow its instructions. Announce: "Using [skill] for [purpose]" |
| 70-90 | **Multi auto-invoke**. Load ALL skills in this range. Read each SKILL.md, merge their guidance contextually. Announce: "Using [skills] for [purpose]" listing each one |
| 40-70 | **Prompt user**: "These skills might help: [top 2-3]. Which should I use?" |
| < 40 | **No match → suggest install**. Reason from task intent what skill would help. Name it, describe what it does, and explain why it fits. Ask if they want to find or create it. Then proceed with base layer only. |

**Multi-skill merging rule:** When loading multiple skills, apply their guidance as complementary layers. If they conflict, the higher-scored skill's guidance takes precedence. Do not load skills whose guidance is a subset of another loaded skill (e.g., TDD and test-driven-development).

### 6. Load the matched skill(s)

For the winning skill(s), `Read` the file at the `path` stored in the index, then follow that skill's workflow instructions for the task.

When loading multiple skills:
1. Deduplicate — skip skills that are functional aliases (e.g., `tdd` and `test-driven-development`; pick the higher-scored one)
2. Sort descending by score
3. Read each SKILL.md
4. Announce all loaded skills with their scores
5. Apply guidance composably — non-overlapping sections from each skill are additive; overlapping sections use the highest-scored skill's version

## Design Rationale

### Scoring Weights (40/60 split)
- **Keyword overlap (0-40)**: Direct domain/action/technology keyword matches provide high-precision signal. Capped at 40 to prevent over-weighting exact matches.
- **Token overlap (0-60)**: Broader term matching captures semantic relatedness beyond exact keyword hits. Higher weight allows contextual matching to dominate overall scoring.
- **Thresholds**: >70 auto-invoke ensures high-confidence matches fire automatically. 40-70 prompts for user confirmation. <40 skips to avoid false positives.
- **Index-based loading**: Using `.skills-index.json` (~5KB for 50 skills) instead of the system prompt (~50KB+) reduces per-session context overhead by ~85%.

### Why always-on base layer?
Caveman, Karpathy Guidelines, and Superpowers are **meta-skills** that apply to every interaction regardless of domain:
- **Caveman** keeps responses token-efficient
- **Karpathy** prevents overcomplication, scope creep, and silent assumptions
- **Superpowers** ensures no relevant skill is missed

They cost ~0 added context because they're already in the prompt or trivially small.

## Utility

For deterministic pre-scoring of skill-task matches:

```bash
# Interactive mode (prompts for task description)
node scripts/skill-matcher.js

# Batch mode
SKILLS_JSON='[{"name":"test","description":"testing framework"}]' node scripts/skill-matcher.js "fix login bug"

# From file
node scripts/skill-matcher.js "fix login bug" ./path/to/skills.json

# Build lightweight skills index for LLM workflow
node scripts/skill-matcher.js --index

# Build enriched index with project context detection (reads package.json, etc.)
node scripts/skill-matcher.js --enrich

# Multi-skill mode: return all skills above threshold (default: 70)
node scripts/skill-matcher.js --multi "build a react dashboard" ./skills-index.json

# Multi-skill mode with custom threshold
node scripts/skill-matcher.js --multi --threshold 60 "debug login flow" ./skills-index.json
```

## Rules

- Run this before ANY clarifying question. Skill context may change what you ask.
- **Re-run on every task change.** Detect task switches by parsing user messages — new domain, action, or technology signals a shift. On task change, skip step 0 (index still valid) and step 1 (base layer still loaded); re-run from step 2.
- On session start, run full workflow (steps 0-6). On mid-session task switch, run steps 2-6 only.
- Always load Caveman + Karpathy Guidelines + Superpowers first — they are non-negotiable on every task.
- After base layer, find all task-specific skills scoring >70 and load the top results (multi if 70-90, single if >90).
- If multiple task-specific skills score >70, load all of them (deduplicating aliases). If multiple score >90, only the highest.
- If a skill was already loaded, don't reload. Just apply its rules.
- Never skip this workflow because you "know what the task is." Surface assumptions first.
- If `.skills-index.json` is missing or stale, ask the user to run `--index` to regenerate it.

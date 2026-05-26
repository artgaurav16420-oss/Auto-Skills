---
name: auto-skill-select
description: Automatically selects and invokes the best matching skill for any given task using hybrid keyword + semantic analysis. Scans all installed skills from context and auto-invokes the top match. Use when starting any task to ensure no relevant skill is missed, or when uncertain which skill applies.
---

# Auto Skill Selection

## Overview

Systematically match user tasks to installed skills and auto-invoke the best match. This runs at the START of every task before any other action.

**Architecture**: The auto-selection workflow is executed by the LLM reading this skill. The companion CLI tool (`scripts/skill-matcher.js`) provides deterministic pre-scoring for testing and debugging. The actual reasoned semantic assessment (0-60) is performed by the LLM during workflow execution.

## Workflow

### 1. Parse task intent

Extract from the user's request:
- **Domain**: frontend, backend, testing, design, data, docs, devops, config, ...
- **Action**: create, fix, migrate, refactor, debug, optimize, test, deploy, ...
- **Technologies**: react, typescript, python, docker, supabase, ...
- **Keywords**: specific terms that narrow the task (e.g., "migration", "realtime", "auth")

### 2. Scan installed skills

Read `available_skills` from system prompt. For each skill, extract:
- **name** — skill identifier
- **description** — what it does
- **triggers** — implicit keywords from the description (e.g., "bug" for `diagnose`, "test" for `tdd`)

### 3. Hybrid scoring (0-100)

**Keyword overlap (0-40):**
Count matching domain/action/tech keywords between task and each skill's description. Normalize to 0-40.

**Semantic relevance (0-60):**
Reasoned assessment:
- Does the skill's purpose directly address the user's goal? (+30)
- Does the skill cover the task's specific pain point? (+20)
- Is the skill designed for this level of complexity? (+10)

### 4. Threshold-based invocation

| Score | Action |
|-------|--------|
| > 70 | **Auto-invoke**. Call `skill` tool. Announce: "Using [skill] for [purpose]" |
| 40-70 | **Prompt user**: "These skills might help: [top 2-3]. Which should I use?" |
| < 40 | **No match**. Proceed without skills. |

### 5. Persistence

If top skill is already loaded (e.g., caveman, karpathy), don't reload. Just apply its rules.

## Design Rationale

### Scoring Weights (40/60 split)
- **Keyword overlap (0-40)**: Direct domain/action/technology keyword matches provide high-precision signal. Capped at 40 to prevent over-weighting exact matches.
- **Token overlap (0-60)**: Broader term matching captures semantic relatedness beyond exact keyword hits. Higher weight allows contextual matching to dominate overall scoring.
- **Thresholds**: >70 auto-invoke ensures high-confidence matches fire automatically. 40-70 prompts for user confirmation. <40 skips to avoid false positives.

## Utility

For deterministic pre-scoring of skill-task matches:

```bash
# Interactive mode (prompts for task description)
node scripts/skill-matcher.js

# Batch mode (task text as first arg, optional skills JSON file as second)
SKILLS_JSON='[{"name":"test","description":"testing framework"}]' node scripts/skill-matcher.js "fix login bug"

# From file
node scripts/skill-matcher.js "fix login bug" ./path/to/skills.json
```

The `SKILLS_JSON` environment variable accepts a JSON array of `{name, description}` objects. This is the primary mechanism for injecting the actual `available_skills` list into the CLI tool.

The semantic scoring in the CLI tool uses token-overlap heuristics as an approximation. The full reasoned assessment (0-60) is performed by the LLM during workflow step 3.

## Rules

- Run this before ANY clarifying question. Skill context may change what you ask.
- If multiple skills score > 70, invoke the highest. Mention the runner-up.
- If a skill was already loaded by the user, skip auto-invocation — you're already using it.
- Never skip this workflow because you "know what the task is." Surface assumptions first.

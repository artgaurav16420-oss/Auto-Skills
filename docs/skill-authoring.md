# Skill Authoring Guide

This guide explains how to write SKILL.md files that score well with the Auto-Skills hybrid scoring engine.

## Required Frontmatter Fields

Every SKILL.md must have YAML frontmatter with at least these two fields:

```yaml
---
name: my-skill
description: A concise description of what this skill does
---
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier for the skill. Lowercase, hyphens allowed. |
| `description` | Yes | One-line summary used for scoring. Keep it under 200 characters. |

## How Scoring Works

The hybrid scoring engine evaluates your skill's description against the user's task:

1. **Keyword Score (0-40):** Matches domain, action, and technology keywords from your description against the task.
2. **Semantic Score (0-60):** Broader word-boundary matching of all task tokens plus synonym expansions against the skill description.
3. **Total (0-100):** Rounded sum with detailed breakdown.

## Writing Descriptions That Score Well

### Include Relevant Keywords

Add domain, action, and technology keywords naturally in your description:

```yaml
# Good — includes domain (testing), action (fix), technology (react)
description: Testing and fixing React components in a frontend application

# Poor — no domain/action/tech keywords
description: A skill for doing things
```

### Keyword Categories

The engine recognizes these keyword categories:

**Domains:** frontend, backend, testing, design, data, docs, devops, config, database, network, security, mobile, cli, api

**Actions:** create, fix, migrate, refactor, debug, optimize, test, deploy, build, add, remove, update, rename, configure, write, implement, make, setup

**Technologies:** react, typescript, python, docker, supabase, node, javascript, css, html, rust, go, java, ruby, postgres, sql, vue, angular, svelte, next, nuxt

### Examples

```yaml
# ✅ Strong description
name: diagnose
description: Disciplined debugging, bug fixing, and error diagnosis for frontend and backend code
# Matches: domain(frontend, backend), action(debug, fix), tech(node), keywords(error, diagnosis)
# Score potential: 70-100 for debugging tasks

# ✅ Good generic description
name: tdd
description: Test-driven development for features and bugfixes using tests
# Matches: action(test), keywords(tdd, development, features, bugfixes)
# Score potential: 40-80 for testing tasks

# ❌ Weak description
name: helper
description: A skill
# Matches: nothing specific
# Score potential: 0-10 for most tasks
```

## Common Pitfalls

| Pitfall | Example | Fix |
|---------|---------|-----|
| Too vague | "A skill for coding" | "Fixing backend bugs in Python web applications" |
| Missing keywords | "Handles auth flow" | "Configuring authentication and security for backend APIs" |
| Overly long | Paragraphs of text | Single focused sentence (under 200 chars) |
| Keyword stuffing | "debug fix test create build frontend backend react node python" | Natural sentence with relevant keywords |

## Path Field

When building the skills index, each skill gets a `path` field pointing to its SKILL.md. Ensure your SKILL.md is in its own directory:

```
~/.agents/skills/my-skill/SKILL.md
```

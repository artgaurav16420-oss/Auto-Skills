# Auto-Skills

Automatically selects and invokes the best matching skill for any task using hybrid keyword + semantic analysis.

## How it works

This is an **agent skill** for OpenCode / Claude Code / Gemini CLI that runs at the START of every task. It:

1. Parses the user's task intent (domain, action, technologies, keywords)
2. Scans all installed skills from the system prompt
3. Scores each skill via keyword overlap (0-40) + reasoned semantic assessment (0-60)
4. Auto-invokes the top match or prompts the user

## CLI Utility

The companion script `scripts/skill-matcher.js` provides deterministic pre-scoring for testing:

```bash
# Interactive mode
node scripts/skill-matcher.js

# Batch mode with SKILLS_JSON env var
SKILLS_JSON='[{"name":"test","description":"testing framework"}]' node scripts/skill-matcher.js "fix login bug"

# From a JSON file
node scripts/skill-matcher.js "fix login bug" ./skills.json
```

## Scoring

| Component | Range | Description |
|-----------|-------|-------------|
| Keyword overlap | 0-40 | Matches domain/action/tech keywords between task and skill description |
| Semantic relevance | 0-60 | Reasoned assessment by the LLM (CLI: token-overlap approximation) |
| **Total** | **0-100** | |

## Thresholds

| Score | Action |
|-------|--------|
| > 70 | Auto-invoke skill |
| 40-70 | Prompt user with top 2-3 suggestions |
| < 40 | No match — proceed without skills |

## Development

```bash
node scripts/skill-matcher.js "debug auth"  # Test scoring
npm test                                    # Run unit tests
```

## API Reference

### `score(skills, taskText)`
- **Parameters**: `skills` (Array of `{name, description}`), `taskText` (string)
- **Returns**: Array of `{name, score, details: {keywordScore, semanticScore}}` sorted by score descending
- **Description**: Scores each skill against a task description using hybrid keyword + token overlap analysis

### `tokenize(text)`
- **Parameters**: `text` (string)
- **Returns**: Array of normalized tokens (lowercased, stop words removed, filtered by minimum length)
- **Description**: Splits and normalizes text into tokens for analysis

### `loadSkills(customPath)`
- **Parameters**: `customPath` (optional string path to JSON file)
- **Returns**: Array of `{name, description}` objects from file or `SKILLS_JSON` env var
- **Description**: Loads skill definitions from a JSON file or environment variable

### `extractIntent(text)`
- **Parameters**: `text` (string)
- **Returns**: `{domains, actions, technologies, keywords}` — each an array of matching tokens
- **Description**: Extracts structured intent (domain, action, technology, keywords) from task text
```

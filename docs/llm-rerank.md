# LLM Reranker Plugin

The reranker provides an optional LLM-based tiebreaker when the hybrid scorer produces ambiguous results (multiple skills scoring 70-90 on the same task).

## How It Works

1. The hybrid scorer (keyword + semantic) produces a ranked list.
2. If the top-3 scores are within 15 points of each other, the reranker fires.
3. The reranker sends the task + top-3 candidates to an LLM and asks it to pick the best one.
4. The LLM's choice wins. If the LLM is unreachable or returns an invalid name, the original #1 is kept.

## Configuration

Set these environment variables to enable the LLM reranker:

```bash
# Required
export LLM_RERANK_API_KEY="sk-..."

# Optional (defaults: gpt-4o-mini / OpenAI endpoint)
export LLM_RERANK_MODEL="gpt-4o-mini"
export LLM_RERANK_ENDPOINT="https://api.openai.com/v1/chat/completions"
```

Supports any OpenAI-compatible chat completions endpoint (OpenAI, Azure, Anthropic via proxy, local LLMs).

## Custom Reranker

You can inject your own reranker function via `createReranker()`:

```js
const { createReranker } = require('auto-skill-select/src/reranker');

function myReranker(top3, query) {
  // top3: [{name, score, description}, ...]
  // query: the user's task string
  // Return: { name: string, source: string }
  return { name: top3[0].name, source: 'custom' };
}

const { rerank } = createReranker(myReranker);
const result = await rerank(top3, query);
```

## Fallback Behavior

| Condition | Behavior |
|-----------|----------|
| No `LLM_RERANK_API_KEY` | Skip rerank, return #1 candidate |
| API call fails / timeout | Return #1 candidate, log warning |
| LLM returns invalid name | Return #1 candidate |
| All scores within 3 points | Strongest rerank signal — genuinely ambiguous |

## When to Use

- **High-stakes skill routing** — when picking the wrong skill wastes context
- **Large skill collections** (100+) — where keyword/semantic overlap is common
- **Custom/niche skills** — that the keyword lexicon doesn't cover well

## When NOT to Use

- **Single-skill environments** — no ambiguity to resolve
- **Offline/air-gapped systems** — no LLM endpoint available

# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.2.x   | ✅ Active support |
| 2.1.x   | ✅ Active support |
| 2.0.x   | ✅ Active support |
| < 2.0   | ❌ Not supported  |

## Reporting a Vulnerability

Please report security issues via **GitHub Private Advisory** at:
https://github.com/artgaurav16420-oss/Auto-Skills/security/advisories/new

Do not open public issues for security vulnerabilities.

## Security Controls

- **Path traversal protection**: All skill file paths are validated against an allowlist of known safe directories using `fs.realpathSync` + `path.relative` normalization.
- **No telemetry**: The tool makes zero network calls unless the user explicitly configures an LLM reranker endpoint.
- **No data exfiltration**: All scoring runs entirely locally. No task descriptions or skill data are transmitted.
- **Optional dependencies**: The `@huggingface/transformers` package (used for semantic scoring) is an optional dependency — not installed unless explicitly requested.

## Excluded from Scope

The LLM reranker endpoint (`LLM_RERANK_API_KEY` / `LLM_RERANK_ENDPOINT`) is user-configured and user-managed. Users are responsible for securing their own API keys and endpoints. This is an opt-in feature that is disabled by default.

# Changelog

## [2.2.1] - 2026-05-29

### Added
- `ScoreResult.details` now includes `tokenOverlap` field alongside `semanticScore` for clarity. Non-breaking — `semanticScore` kept as compat alias.

### CI
- Benchmark and coverage smoke steps added to GitHub Actions workflow.

---

## [2.2.0] - 2026-05-27

### Fixed
- `extractIntent()` — synonym expansion no longer inflates
  `domains`/`actions`/`technologies` counts. Intent classification
  now uses raw tokens only; synonym-expanded tokens go to `keywords`
  for broader token overlap recall. Fixes scoring ceiling bug where
  tasks with purely technical descriptions could only reach 40/100.
- `parseSkillFrontmatter()` — CRLF line endings now normalized to LF
  before parsing, fixing SKILL.md discovery on Windows.
- `isPathAllowed()` — extended allowlist now covers `~/.agents`,
  `~/.config/opencode`, `~/.claude`, `~/.cache`, and `os.tmpdir()`.
  Absolute paths to outside these roots are blocked (previously only
  relative paths were checked).

### Added
- `data/benchmark-skills/` — three reference skills (`debug-skill`,
  `test-skill`, `deploy-skill`) shipped with the repo so
  `npm run benchmark` runs against real data out of the box.
- CI smoke test: `--validate SKILL.md` (must pass) and
  `--validate package.json` (must exit 1) run on every push/PR.
- `index.d.ts` — `Skill` interface now includes `hash?: string` and
  `embedding?: number[]` fields matching actual `buildSkillIndex` output.

### Security
- `isPathAllowed()` now applied to ALL `loadSkills` inputs regardless
  of whether the path is absolute or relative, closing a bypass where
  absolute paths (e.g. `/etc/passwd`) were never checked.

### Tests
- 8 new tests: 2 for `extractIntent` synonym inflation, 6 for
  `isPathAllowed` allowlist and block cases.
- Total: 85 tests, all passing.

## [2.1.0] - 2026-05-27

### Added
- **Semantic scoring** via `@huggingface/transformers` — `--semantic` CLI flag loads a Transformer model for dense embedding computation
- **Hybrid scoring mode** — combines keyword score (0.3 weight) with semantic embedding similarity (0.7 weight) for more accurate skill matching
- **Synonym expansion** — `data/synonyms.json` with 28 synonym mappings; `extractIntent()` auto-expands domain/action/tech terms to improve recall
- **LLM reranker plugin** — `src/reranker.js` provides optional LLM-based tiebreaker for ambiguous top-3 results via `LLM_RERANK_API_KEY` env var
- **Embedding cache** — LRU cache (max 500) in `src/semantic-scorer.js` avoids recomputing embeddings for repeat skills
- **`benchmark/` suite** — 60 diverse tasks in `tasks.json` with `benchmark/run.js` runner for measuring scoring precision
- `computeEmbedding` exported from `src/semantic-scorer.js` for direct use
- `resetSynonyms()` and `loadSynonyms()` exported for dynamic synonym management
- `docs/llm-rerank.md` — comprehensive documentation for the LLM reranker feature
- `npm run benchmark` script added to package.json

### Changed
- `score()` is now **async** (returns `Promise<Array>`) to support optional embedding computation
- `buildSkillIndex()` is now **async** (returns `Promise<Array>`) to support optional embedding precomputation
- `extractIntent()` now applies synonym expansion by default — "debug" produces `debug, diagnose, troubleshoot, trace, fix`
- Hybrid scoring formula: `0.3 * keywordScore + 0.7 * semanticScore` when `computeSemantic` callback is provided
- `tokenize()` accepts optional `{ expandSynonyms: true }` option for granular control

### Fixed
- `src/semantic-scorer.js` — corrupted `getFeatureExtractor()` function (orphaned code outside function body, missing imports) rewritten with proper lazy async singleton pattern
- `resetSynonyms` and `loadSynonyms` properly exported from CLI module.exports for test access
- Benchmark score display — `top.totalScore` changed to `top.score` to match actual score() return shape
- ESLint config: added `fetch` to globals for Node 18+ global fetch support
- Cleaned up unused imports (`logger` in CLI and tokenizer, `path` and `fs` in semantic-scorer)

## [2.0.0] - 2026-05-27

### Added
- Modular source structure: `src/tokenizer.js`, `src/scorer.js`, `src/scanner.js`, `src/setup.js`, `src/index.js`
- Structured logging with `[auto-skills:level]` prefix, respects `DEBUG` env variable
- `--validate` CLI command to check SKILL.md validity (frontmatter, paths, required fields)
- `docs/skill-authoring.md` — guide for writing descriptions that score well
- LRU eviction policy on tokenizeCache (max 1000 entries) to prevent unbounded memory growth
- `clearCache()` exported function for cache management

### Fixed
- Hardcoded Windows paths (`C:\Users\INP\...`) replaced with `~/.agents/skills/...` in SKILL.md
- Rounding inconsistency in `score()` — keyword and semantic scores are now rounded individually *before* summing, so `displayed_keyword + displayed_semantic === total`
- `walkForSubdir` empty `catch {}` — now logs debug messages via structured logger
- Documentation test counts updated from 30/46 to 55 across CONTRIBUTING.md and README.md

### Changed
- `console.warn` replaced with `logger.warn` throughout the codebase
- Tokenize cache now uses LRU eviction instead of unbounded growth
- `score()` rounds component scores before summation for consistency

### Refactored
- `scripts/skill-matcher.js` now imports from `src/index.js` — thin CLI wrapper
- All exported functions maintain the same public API for backward compatibility

## [1.0.0] - 2026-05-26

### Added
- Initial release
- Hybrid scoring: keyword overlap (0-40) + token overlap (0-60)
- CLI utility for deterministic pre-scoring
- Domain/action/technology intent extraction
- Threshold-based invocation (>70 auto-invoke, 40-70 prompt, <40 skip)
- Tokenization cache for repeated score calls
- Coverage reporting via `npm run test:coverage`
- Path traversal protection using path.relative + fs.realpathSync normalization
- Input truncation for long task descriptions
- `"private": true` in package.json for accidental publish protection
- Shebang for direct CLI execution
- JSDoc annotations on exported functions
- 'use strict' mode in all source files
- MIT license headers in source files
- Error logging on loadSkills failures
- Security event logging for path traversal attempts
- Word-boundary matching for token overlap scores
- `keywords` field in package.json

### Fixed
- Path traversal guard now uses path.relative + fs.realpathSync instead of startsWith
- Double-counting of domain/action/tech tokens in semantic score
- Inconsistent rounding between keywordScore and semanticScore
- Env var cleanup in tests uses beforeEach/afterEach
- Console side-effects removed from exported score function
- Readline error handler now calls rl.close() before exit
- Substring-match inflation in computeTokenOverlapScore replaced with word-boundary matching
- Unclosed README code block
- main() function refactored to reduce code duplication
- MIN_TOKEN_LENGTH reduced from 2 to 1 to preserve single-char tokens
- Type guard added for loadSkills customPath parameter
- JSDoc @param/@returns tags added to all exported functions
- Dead constant AUTO_INVOKE_THRESHOLD removed

### Security
- Path traversal guard hardened against symlink bypass via fs.realpathSync
- Security event logging added for blocked path traversal attempts

## [0.0.0] - 2026-05-26
- Project initialized

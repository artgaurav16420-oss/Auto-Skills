# auto-skill-select

Zero-dependency Node.js skill router. Scans `SKILL.md` frontmatter, scores skills against task text, auto-invokes best match.

## Commands

```bash
npm test                             # 46 tests, uses node:test (not jest/vitest)
npm run test:coverage                # --experimental-test-coverage
node scripts/skill-matcher.js        # interactive mode
node scripts/skill-matcher.js <task> [skills.json]
node scripts/skill-matcher.js --scan <task> [dir]   # auto-discover + score
node scripts/skill-matcher.js --index [out] [dir]   # build .skills-index.json
node scripts/skill-matcher.js --enrich [dir] [out] [scanDir]  # enriched index
node scripts/skill-matcher.js --multi [--threshold N] <task> [index]
node scripts/skill-matcher.js --catalog              # show known-skills.json
node scripts/skill-matcher.js --setup [path]         # add hook to AGENTS.md
```

## Architecture

- **Entrypoint:** `scripts/skill-matcher.js` (both CLI + library via `module.exports`)
- **Scoring pipeline:** `tokenize()` → `extractIntent()` → keyword score (0-40) + token overlap (0-60)
- **Scans 3 dirs by default:** `~/.agents/skills/`, `~/.config/opencode/skills/`, `~/.claude/skills/`
- **Index (.skills-index.json):** lightweight (~5KB for 50 skills) vs full SKILL.md content (~50KB)
- **Enriched index:** wraps skills with `{ project: {...}, skills: [...] }` — detects Node/Python/Rust/Go projects
- **Path traversal protection:** `isPathAllowed()` uses `fs.realpathSync` + `path.relative` check

## Conventions

- **CommonJS** (`require`/`module.exports`), not ESM
- **JSDoc** on all exported functions
- **Named constants** for magic numbers (KEYWORD_SCORE_MAX, etc.)
- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Zero deps policy** — no new npm dependencies without discussion
- **YAML frontmatter** in SKILL.md parsed via regex, not a YAML library

## Testing quirks

- Tests use `node:test` (built-in), not third-party runners
- Integration tests spawn CLI via `child_process.execSync` with 5s timeout
- Test-scratch dirs go under `.code-review-cache/` (gitignored)
- CI: ubuntu-latest, Node 18/20/22 matrix, just `npm test`

## Key gotchas

- `.skills-index.json` is gitignored — regenerate with `--index` after adding/updating skills
- `tokenize()` caches results per input string — not cleared between `score()` calls (fine for single-use)
- `SECURE_BASE_DIR` is locked to `process.cwd()` at import time — changes cwd after first require breaks path checks
- `loadSkills()` silently returns `[]` on bad input — check return value
- `extractIntent()` only recognizes a hardcoded lexicon of domain/action/tech terms — unknown terms land in `keywords`

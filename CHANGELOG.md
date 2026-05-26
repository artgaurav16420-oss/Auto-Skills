# Changelog

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

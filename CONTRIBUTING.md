# Contributing

## How to contribute

1. Open an issue to discuss changes before implementing
2. Write tests for any new functionality
3. Run `npm test` before submitting
4. Run `npm run lint` to check for style issues
5. Run `npm run build:plugin` if you modified plugins/
6. Update SKILL.md if the workflow or scoring logic changes

## Project structure

Source lives in `src/` (modular) with the CLI wrapper at `scripts/skill-matcher.js`. Tests are in `scripts/skill-matcher.test.js`. Plugins (TypeScript) live in `plugins/` — compile with `npm run build:plugin`.

## Code style

- ES6+ JavaScript, CommonJS modules
- JSDoc on all exported functions
- Named constants for all magic numbers
- No new runtime dependencies without discussion (optionalDependencies allowed)

## Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code change with no behavior change
- `test:` adding or fixing tests
- `chore:` maintenance tasks

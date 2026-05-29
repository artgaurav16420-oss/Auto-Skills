'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter, discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd, resetSynonyms } = require('./skill-matcher');

describe('tokenize', () => {
  it('splits text into normalized tokens', () => {
    assert.deepStrictEqual(tokenize('Fix login bug'), ['fix', 'login', 'bug']);
  });

  it('preserves hyphens in tokens', () => {
    assert.deepStrictEqual(tokenize('create-react-app!'), ['create-react-app']);
  });

  it('filters stop words', () => {
    assert.deepStrictEqual(tokenize('the and of fix'), ['fix']);
  });

  it('returns empty array for null input', () => {
    assert.deepStrictEqual(tokenize(null), []);
  });

  it('returns empty array for empty string', () => {
    assert.deepStrictEqual(tokenize(''), []);
  });

  it('returns empty array for undefined input', () => {
    assert.deepStrictEqual(tokenize(undefined), []);
  });

  it('filters tokens of length 1 or less', () => {
    assert.deepStrictEqual(tokenize('a to fix'), ['fix']);
  });

  it('preserves single-character meaningful tokens', () => {
    assert.deepStrictEqual(tokenize('c rust go'), ['c', 'rust', 'go']);
  });

  it('returns empty array for whitespace-only input', () => {
    assert.deepStrictEqual(tokenize('   '), []);
  });

  it('expands synonyms when option is set', () => {
    const result = tokenize('debug auth', { expandSynonyms: true });
    assert.ok(result.includes('debug'));
    assert.ok(result.includes('fix'));
    assert.ok(result.includes('login'));
  });

  it('evicts oldest cache entry when cache exceeds limit', () => {
    const { clearCache } = require('./skill-matcher');
    clearCache();
    const maxSize = 1000;
    for (let i = 0; i < maxSize + 1; i++) {
      tokenize(`unique-string-${i}-${Date.now()}-${Math.random()}`);
    }
    const result = tokenize('hello world');
    assert.deepStrictEqual(result, ['hello', 'world']);
    clearCache();
  });
});

describe('extractIntent', () => {
  beforeEach(() => resetSynonyms());

  it('extracts domain, action, technology, keywords with synonym expansion', () => {
    const result = extractIntent('debug react frontend auth timeout');
    assert.ok(result.domains.includes('frontend'));
    assert.ok(result.domains.includes('auth'));
    assert.ok(result.actions.includes('debug'));
    assert.ok(result.technologies.includes('react'));
    assert.ok(result.keywords.includes('timeout'));
  });

  it('returns empty arrays for unrecognized input', () => {
    const result = extractIntent('foo bar baz');
    assert.deepStrictEqual(result.domains, []);
    assert.deepStrictEqual(result.actions, []);
    assert.deepStrictEqual(result.technologies, []);
    assert.deepStrictEqual(result.keywords, ['foo', 'bar', 'baz']);
  });

  it('returns empty fields for null input', () => {
    const result = extractIntent(null);
    assert.deepStrictEqual(result, { domains: [], actions: [], technologies: [], keywords: [] });
  });

  it('returns empty fields for empty string input', () => {
    const result = extractIntent('');
    assert.deepStrictEqual(result, { domains: [], actions: [], technologies: [], keywords: [] });
  });

  it('returns empty fields for whitespace-only input', () => {
    const result = extractIntent('   ');
    assert.deepStrictEqual(result, { domains: [], actions: [], technologies: [], keywords: [] });
  });

  it('returns empty fields for stop-words-only input', () => {
    const result = extractIntent('the and of');
    assert.deepStrictEqual(result, { domains: [], actions: [], technologies: [], keywords: [] });
  });

  it('does not double-count tokens across categories after synonym expansion', () => {
    const result = extractIntent('debug security');
    const allTokens = [...result.domains, ...result.actions, ...result.technologies, ...result.keywords];
    const unique = new Set(allTokens);
    assert.strictEqual(allTokens.length, unique.size, 'No token should appear in multiple categories');
  });

  it('synonym expansion does not inflate action count', () => {
    const result = extractIntent('debug react');
    assert.strictEqual(result.actions.length, 1);
    assert.ok(result.actions.includes('debug'));
    assert.ok(!result.actions.includes('fix'),
      'synonym of action should not appear in actions');
  });

  it('keyword pool includes synonym expansions for recall', () => {
    const result = extractIntent('debug');
    assert.ok(result.keywords.includes('diagnose'));
    assert.ok(result.keywords.includes('troubleshoot'));
  });
});

describe('score', () => {
  const skills = [
    { name: 'diagnose', description: 'Debugging and fixing bugs and errors' },
    { name: 'tdd', description: 'Test-driven development for features and bugfixes' },
    { name: 'writing-plans', description: 'Creating implementation plans from requirements' }
  ];

  it('ranks skills by relevance', async () => {
    const results = await score(skills, 'debug the auth bug in the login flow');
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].name, 'diagnose');
    assert.ok(results[0].score >= results[1].score, 'results should be descending');
    assert.ok(results[1].score >= results[2].score, 'results should be descending');
  });

  it('returns scores between 0 and 100', async () => {
    const results = await score(skills, 'debug auth');
    for (const r of results) {
      assert.ok(r.score >= 0, `${r.name} score ${r.score} < 0`);
      assert.ok(r.score <= 100, `${r.name} score ${r.score} > 100`);
    }
  });

  it('score stays bounded with synonym-rich input (no double-count inflation)', async () => {
    const results = await score(skills, 'debug fix test security database');
    for (const r of results) {
      assert.ok(r.score >= 0 && r.score <= 100, `${r.name} score ${r.score} out of bounds`);
    }
  });

  it('returns empty array for empty skills', async () => {
    assert.deepStrictEqual(await score([], 'test'), []);
  });

  it('returns empty array for empty task', async () => {
    assert.deepStrictEqual(await score(skills, ''), []);
  });

  it('skips malformed skill entries', async () => {
    const mixed = [
      { name: 'valid', description: 'a real skill' },
      null,
      { name: 'missing-desc' }
    ];
    const results = await score(mixed, 'test task');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'valid');
  });

  it('handles very long input without crashing', async () => {
    const long = 'a'.repeat(10000);
    const results = await score(skills, long);
    assert.ok(Array.isArray(results));
  });

  it('returns bounded scores for known inputs', async () => {
    const single = [{ name: 'test', description: 'debugging' }];
    const results = await score(single, 'debug');
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].score >= 0);
    assert.ok(results[0].score <= 100);
  });

  it('returns details with correct shape and rounded integer values', async () => {
    const results = await score(skills, 'debug auth');
    for (const r of results) {
      assert.ok(r.details);
      assert.ok(typeof r.details.keywordScore === 'number');
      assert.ok(Number.isInteger(r.details.keywordScore));
      assert.ok(r.details.keywordScore >= 0);
    }
  });

  it('handles hyphenated technology names in pipeline', async () => {
    const skillsWithHyphen = [{ name: 'react', description: 'Build react apps' }];
    const results = await score(skillsWithHyphen, 'build react frontend');
    assert.ok(results.length > 0);
    assert.ok(results[0].score > 0);
  });
});

describe('loadSkills', () => {
  let oldEnv;

  beforeEach(() => {
    oldEnv = process.env.SKILLS_JSON;
  });

  afterEach(() => {
    if (oldEnv) process.env.SKILLS_JSON = oldEnv;
    else delete process.env.SKILLS_JSON;
  });

  it('returns empty array with no input and no env var', () => {
    delete process.env.SKILLS_JSON;
    assert.deepStrictEqual(loadSkills(), []);
  });

  it('loads from SKILLS_JSON env var', () => {
    process.env.SKILLS_JSON = JSON.stringify([{ name: 'test', description: 'A test skill' }]);
    const skills = loadSkills();
    assert.strictEqual(skills.length, 1);
    assert.strictEqual(skills[0].name, 'test');
  });

  it('handles malformed SKILLS_JSON gracefully', () => {
    process.env.SKILLS_JSON = 'not json';
    const skills = loadSkills();
    assert.deepStrictEqual(skills, []);
  });

  it('handles valid JSON with invalid array structure from env var', () => {
    process.env.SKILLS_JSON = JSON.stringify([{ foo: 'bar' }]);
    const skills = loadSkills();
    assert.deepStrictEqual(skills, []);
  });

  it('returns empty array for non-existent custom path', () => {
    const skills = loadSkills('./nonexistent-file.json');
    assert.deepStrictEqual(skills, []);
  });
});

describe('parseSkillFrontmatter', () => {
  it('parses name and description from valid frontmatter', () => {
    const content = `---
name: test-skill
description: A skill for testing things
---`;
    const result = parseSkillFrontmatter(content);
    assert.deepStrictEqual(result, { name: 'test-skill', description: 'A skill for testing things' });
  });

  it('returns null for content without frontmatter', () => {
    assert.strictEqual(parseSkillFrontmatter('# Just a heading'), null);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(parseSkillFrontmatter(''), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(parseSkillFrontmatter(null), null);
  });

  it('returns null for non-string input', () => {
    assert.strictEqual(parseSkillFrontmatter(42), null);
  });

  it('handles multiline descriptions', () => {
    const content = `---
name: multiline-skill
description: >
  A skill with
  a wrapped description
---`;
    const result = parseSkillFrontmatter(content);
    assert.ok(result);
    assert.strictEqual(result.name, 'multiline-skill');
    assert.ok(result.description.length > 0);
  });

  it('parses real-world SKILL.md format', () => {
    const content = `---
name: auto-skill-select
description: Automatically selects and invokes the best matching skill for any given task using hybrid keyword + semantic analysis. Scans all installed skills from context and auto-invokes the top match. Use when starting any task to ensure no relevant skill is missed, or when uncertain which skill applies.
---`;
    const result = parseSkillFrontmatter(content);
    assert.ok(result);
    assert.strictEqual(result.name, 'auto-skill-select');
    assert.ok(result.description.includes('hybrid keyword'));
  });
});

describe('discoverSkills', () => {
  const tmpDir = path.join(__dirname, '..', '.code-review-cache', 'test-skills-scan');

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'skill-a'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'skill-b'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'empty-dir'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skill-a', 'SKILL.md'), `---
name: skill-a
description: The first test skill
---`);
    fs.writeFileSync(path.join(tmpDir, 'skill-b', 'SKILL.md'), `---
name: skill-b
description: The second test skill for debugging
---`);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('discovers skills from specified directories', () => {
    const skills = discoverSkills([tmpDir]);
    assert.strictEqual(skills.length, 2);
    assert.ok(skills.some(s => s.name === 'skill-a'));
    assert.ok(skills.some(s => s.name === 'skill-b'));
  });

  it('deduplicates skills with the same name', () => {
    fs.mkdirSync(path.join(tmpDir, 'skill-a-dup'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skill-a-dup', 'SKILL.md'), `---
name: skill-a
description: Duplicate of skill-a
---`);
    const skills = discoverSkills([tmpDir]);
    const skillACount = skills.filter(s => s.name === 'skill-a').length;
    assert.strictEqual(skillACount, 1);
  });

  it('skips directories without SKILL.md', () => {
    const skills = discoverSkills([tmpDir]);
    assert.ok(!skills.some(s => s.name === 'empty-dir'));
  });

  it('returns empty array for non-existent directory', () => {
    const skills = discoverSkills([path.join(tmpDir, 'non-existent')]);
    assert.deepStrictEqual(skills, []);
  });
});

describe('buildSkillIndex', () => {
  const tmpDir = path.join(__dirname, '..', '.code-review-cache', 'test-index');

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpDir, 'skill-x'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'skill-y'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skill-x', 'SKILL.md'),
      '---\nname: skill-x\ndescription: The X skill\n---');
    fs.writeFileSync(path.join(tmpDir, 'skill-y', 'SKILL.md'),
      '---\nname: skill-y\ndescription: The Y skill\n---');
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('writes index to specified output path', async () => {
    const outPath = path.join(tmpDir, 'test-index.json');
    const result = await buildSkillIndex(outPath, [tmpDir]);
    assert.strictEqual(result.length, 2);
    const loaded = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.strictEqual(loaded.length, 2);
  });

  it('includes path field for each skill entry', async () => {
    const outPath = path.join(tmpDir, 'paths.json');
    const result = await buildSkillIndex(outPath, [tmpDir]);
    assert.ok(result.every(s => s.path));
    assert.ok(result[0].path.endsWith('SKILL.md'));
  });

  it('returns empty array for empty directory', async () => {
    const emptyDir = path.join(tmpDir, 'nothing-here');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = await buildSkillIndex(path.join(tmpDir, 'empty.json'), [emptyDir]);
    assert.deepStrictEqual(result, []);
  });
});

describe('detectProjectContext', () => {
  const sandbox = path.join(__dirname, '..', '.code-review-cache', 'test-project-detect');

  beforeEach(() => {
    fs.mkdirSync(sandbox, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
  });

  it('detects Node + React project', () => {
    fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({
      dependencies: { react: '^18', next: '^13' },
      devDependencies: { jest: '^29' }
    }));
    const ctx = detectProjectContext(sandbox);
    assert.strictEqual(ctx.language, 'node');
    assert.strictEqual(ctx.framework, 'next');
    assert.ok(ctx.testingTools.includes('jest'));
  });

  it('detects Node + Express with libraries', () => {
    fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({
      dependencies: { express: '^4', prisma: '^5', stripe: '^12' },
      devDependencies: { vitest: '^1' }
    }));
    const ctx = detectProjectContext(sandbox);
    assert.strictEqual(ctx.language, 'node');
    assert.strictEqual(ctx.framework, 'express');
    assert.ok(ctx.libraries.includes('prisma'));
    assert.ok(ctx.libraries.includes('stripe'));
    assert.ok(ctx.testingTools.includes('vitest'));
  });

  it('returns empty context for unknown project', () => {
    const ctx = detectProjectContext(sandbox);
    assert.strictEqual(ctx.language, null);
    assert.strictEqual(ctx.framework, null);
    assert.deepStrictEqual(ctx.libraries, []);
    assert.deepStrictEqual(ctx.testingTools, []);
  });

  it('wraps enriched index with project field', async () => {
    fs.writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify({
      dependencies: { react: '^18' }
    }));
    fs.mkdirSync(path.join(sandbox, 'test-skill'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: A test\n---');
    const ctx = detectProjectContext(sandbox);
    const outPath = path.join(sandbox, 'enriched.json');
    const result = await buildSkillIndex(outPath, [sandbox], ctx);
    assert.ok(result.project);
    assert.strictEqual(result.project.framework, 'react');
    assert.ok(Array.isArray(result.skills));
    assert.strictEqual(result.skills.length, 1);
    const loaded = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.ok(loaded.project);
    assert.ok(Array.isArray(loaded.skills));
  });
});

describe('setupAgentsMd', () => {
  const sandbox = path.join(__dirname, '..', '.code-review-cache', 'test-agents-setup');
  const fakeAgents = path.join(sandbox, 'AGENTS.md');

  beforeEach(() => {
    fs.mkdirSync(sandbox, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
  });

  it('creates file with hook when AGENTS.md does not exist', () => {
    const result = setupAgentsMd(fakeAgents);
    assert.strictEqual(result.status, 'created');
    assert.ok(fs.existsSync(fakeAgents));
    const content = fs.readFileSync(fakeAgents, 'utf8');
    assert.ok(content.includes('auto-skill-select'));
    assert.ok(content.includes('EVERY new task'));
  });

  it('appends hook when AGENTS.md exists without it', () => {
    fs.writeFileSync(fakeAgents, '# My config\n\nSome existing content.\n', 'utf8');
    const result = setupAgentsMd(fakeAgents);
    assert.strictEqual(result.status, 'appended');
    const content = fs.readFileSync(fakeAgents, 'utf8');
    assert.ok(content.includes('Some existing content'));
    assert.ok(content.includes('auto-skill-select'));
  });

  it('does not duplicate hook when already present', () => {
    fs.writeFileSync(fakeAgents, 'Some text auto-skill-select more text\n', 'utf8');
    const result = setupAgentsMd(fakeAgents);
    assert.strictEqual(result.status, 'already-present');
    const content = fs.readFileSync(fakeAgents, 'utf8');
    assert.strictEqual(content.trim(), 'Some text auto-skill-select more text');
  });

  it('prints correct message via --setup CLI flag', () => {
    fs.writeFileSync(fakeAgents, 'something auto-skill-select something\n', 'utf8');
    const out = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --setup "${fakeAgents}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.ok(out.includes('already present'));
  });
});

describe('setupOpencodeJsonc', () => {
  const { setupOpencodeJsonc } = require('./skill-matcher');
  const sandbox = path.join(__dirname, '..', '.code-review-cache', 'test-opencode-setup');

  beforeEach(() => {
    fs.mkdirSync(sandbox, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
  });

  it('creates file with recommended config when opencode.jsonc does not exist', () => {
    const fakePath = path.join(sandbox, 'opencode.jsonc');
    const result = setupOpencodeJsonc(fakePath);
    assert.strictEqual(result.status, 'created');
    assert.ok(fs.existsSync(fakePath));
    const loaded = JSON.parse(fs.readFileSync(fakePath, 'utf8'));
    assert.strictEqual(loaded.$schema, 'https://opencode.ai/config.json');
    assert.ok(loaded.instructions.includes('~/.agents/skills/karpathy-guidelines/SKILL.md'));
    assert.ok(loaded.instructions.includes('~/.agents/skills/caveman/SKILL.md'));
    assert.ok(loaded.instructions.includes('~/.agents/skills/auto-skill-select/SKILL.md'));
    assert.strictEqual(loaded.permission.skill['karpathy-guidelines'], 'allow');
    assert.strictEqual(loaded.permission.skill['*'], 'deny');
  });

  it('merges with existing config without removing user settings', () => {
    const fakePath = path.join(sandbox, 'opencode-merge.jsonc');
    fs.writeFileSync(fakePath, JSON.stringify({
      instructions: ['~/.agents/skills/diagnose/SKILL.md'],
      permission: { skill: { diagnose: 'allow' } }
    }, null, 2), 'utf8');
    const result = setupOpencodeJsonc(fakePath);
    assert.strictEqual(result.status, 'updated');
    const loaded = JSON.parse(fs.readFileSync(fakePath, 'utf8'));
    assert.ok(loaded.instructions.includes('~/.agents/skills/diagnose/SKILL.md'));
    assert.ok(loaded.instructions.includes('~/.agents/skills/karpathy-guidelines/SKILL.md'));
    assert.strictEqual(loaded.permission.skill.diagnose, 'allow');
    assert.strictEqual(loaded.permission.skill['*'], 'deny');
  });

  it('is idempotent — running twice produces same result', () => {
    const fakePath = path.join(sandbox, 'opencode-idempotent.jsonc');
    setupOpencodeJsonc(fakePath);
    const first = JSON.parse(fs.readFileSync(fakePath, 'utf8'));
    setupOpencodeJsonc(fakePath);
    const second = JSON.parse(fs.readFileSync(fakePath, 'utf8'));
    assert.deepStrictEqual(first, second);
  });

  it('handles JSONC files with // comments', () => {
    const fakePath = path.join(sandbox, 'opencode-comments.jsonc');
    fs.writeFileSync(fakePath, `{
  // user comment
  "instructions": ["~/.agents/skills/diagnose/SKILL.md"]
}
`, 'utf8');
    const result = setupOpencodeJsonc(fakePath);
    assert.strictEqual(result.status, 'updated');
    const loaded = JSON.parse(fs.readFileSync(fakePath, 'utf8'));
    assert.ok(loaded.instructions.includes('~/.agents/skills/karpathy-guidelines/SKILL.md'));
    assert.ok(loaded.instructions.includes('~/.agents/skills/diagnose/SKILL.md'));
  });

  it('prints correct message via --setup-opencode CLI flag', () => {
    const fakePath = path.join(sandbox, 'cli-opencode.jsonc');
    const out = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --setup-opencode "${fakePath}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.ok(out.includes('Created'));
    assert.ok(out.includes('opencode.jsonc'));
    assert.ok(fs.existsSync(fakePath));
  });

  it('prints updated message for existing file via CLI', () => {
    const fakePath = path.join(sandbox, 'cli-opencode-update.jsonc');
    fs.writeFileSync(fakePath, '{"instructions":[]}', 'utf8');
    const out = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --setup-opencode "${fakePath}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.ok(out.includes('Updated'));
  });

  it('returns error status for unparseable JSON', () => {
    const fakePath = path.join(sandbox, 'opencode-broken.jsonc');
    fs.writeFileSync(fakePath, '{broken json}', 'utf8');
    let result;
    try {
      result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --setup-opencode "${fakePath}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
    } catch (e) {
      result = e.stdout;
    }
    assert.ok(result.includes('Manual setup required'));
  });
});

describe('loadCatalog edge cases', () => {
  const { loadCatalog } = require('./skill-matcher');
  const CATALOG_PATH = require('path').join(__dirname, '..', 'data', 'known-skills.json');

  it('returns empty array when catalog file is missing', () => {
    const origPath = CATALOG_PATH;
    const backup = origPath + '.bak';
    try {
      if (require('fs').existsSync(origPath)) {
        require('fs').renameSync(origPath, backup);
      }
      assert.deepStrictEqual(loadCatalog(), []);
    } finally {
      if (require('fs').existsSync(backup)) {
        require('fs').renameSync(backup, origPath);
      }
    }
  });
});

describe('main (CLI entry point)', () => {
  const testSkillsPath = path.join(__dirname, '..', '.code-review-cache', 'test-skills.json');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(testSkillsPath), { recursive: true });
    fs.writeFileSync(testSkillsPath, JSON.stringify([
      { name: 'test', description: 'A test skill for integration testing' }
    ]), 'utf8');
  });

  afterEach(() => {
    try { fs.unlinkSync(testSkillsPath); } catch {}
  });

  it('prints ranked results for batch mode input', () => {
    const result = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" "test task" "${testSkillsPath}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const parsed = JSON.parse(result.trim());
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length > 0);
    assert.ok(parsed[0].name);
    assert.ok(typeof parsed[0].score === 'number');
  });

  it('prints ranked results with --scan flag', () => {
    const scanDir = path.join(__dirname, '..', '.code-review-cache', 'scan-integration');
    fs.mkdirSync(path.join(scanDir, 'test-skill'), { recursive: true });
    fs.writeFileSync(path.join(scanDir, 'test-skill', 'SKILL.md'), `---
name: test-skill
description: A skill for debugging code
---`);
    try {
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --scan "debug the build" "${scanDir}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      assert.ok(result.includes('test-skill'));
      assert.ok(result.includes('score'));
    } finally {
      try { fs.rmSync(scanDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('prints indexed count with --index flag', () => {
    const indexDir = path.join(__dirname, '..', '.code-review-cache', 'index-integration');
    const indexOut = path.join(indexDir, 'cli-index.json');
    fs.mkdirSync(path.join(indexDir, 'sample-skill'), { recursive: true });
    fs.writeFileSync(path.join(indexDir, 'sample-skill', 'SKILL.md'),
      '---\nname: sample-skill\ndescription: A sample skill\n---');
    try {
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --index "${indexOut}" "${indexDir}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      assert.ok(result.includes('Indexed'));
      const loaded = JSON.parse(fs.readFileSync(indexOut, 'utf8'));
      assert.strictEqual(loaded.length, 1);
      assert.strictEqual(loaded[0].name, 'sample-skill');
      assert.ok(loaded[0].path);
    } finally {
      try { fs.rmSync(indexDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('prints ranked results via --semantic flag', () => {
    let result;
    try {
      result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --semantic "test task" "${testSkillsPath}"`,
        { encoding: 'utf8', timeout: 30000 }
      );
    } catch {
      // Skip: model download may fail on CI
      return;
    }
    const parsed = JSON.parse(result.trim());
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length > 0);
  });

  it('prints enriched index with --enrich flag', () => {
    const enrichDir = path.join(__dirname, '..', '.code-review-cache', 'enrich-integration');
    const enrichOut = path.join(enrichDir, 'ind.json');
    try {
      fs.mkdirSync(path.join(enrichDir, 'demo-skill'), { recursive: true });
      fs.writeFileSync(path.join(enrichDir, 'demo-skill', 'SKILL.md'),
        '---\nname: demo-skill\ndescription: A demo skill\n---');
      fs.writeFileSync(path.join(enrichDir, 'package.json'), JSON.stringify({
        dependencies: { react: '^18' },
        devDependencies: { jest: '^29' }
      }));
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --enrich "${enrichDir}" "${enrichOut}" "${enrichDir}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      assert.ok(result.includes('project context'));
      assert.ok(result.includes('react'));
      const loaded = JSON.parse(fs.readFileSync(enrichOut, 'utf8'));
      assert.ok(loaded.project);
      assert.strictEqual(loaded.project.language, 'node');
      assert.strictEqual(loaded.project.framework, 'react');
      assert.strictEqual(loaded.skills.length, 1);
      assert.strictEqual(loaded.skills[0].name, 'demo-skill');
    } finally {
      try { fs.rmSync(enrichDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('prints results via --rerank flag (fallback mode)', () => {
    const result = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --rerank "test task" "${testSkillsPath}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const lines = result.split(/\r?\n/);
    const startIdx = lines.findIndex(l => l.trim() === '[');
    const endIdx = lines.findIndex(l => l.trim() === ']');
    assert.ok(startIdx !== -1 && endIdx !== -1, 'output should contain JSON array');
    const jsonStr = lines.slice(startIdx, endIdx + 1).join('\n');
    const parsed = JSON.parse(jsonStr);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length > 0);
    assert.strictEqual(parsed[0].name, 'test');
  });

  it('shows error when --rerank has no task', () => {
    const result = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --rerank`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const parsed = JSON.parse(result.trim());
    assert.ok(parsed.error);
  });

  it('--multi returns results above threshold', () => {
    const tempSkills = path.join(__dirname, '..', '.code-review-cache', 'multi-skills.json');
    try {
      fs.writeFileSync(tempSkills, JSON.stringify([
        { name: 'skill-a', description: 'debugging and fixing bugs in code' },
        { name: 'skill-b', description: 'writing documentation and guides' }
      ]), 'utf8');
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --multi --threshold 10 "debug the code" "${tempSkills}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      const parsed = JSON.parse(result.trim());
      assert.ok(parsed.count > 0);
      assert.ok(parsed.threshold, 10);
    } finally {
      try { fs.unlinkSync(tempSkills); } catch {}
    }
  });

  it('--multi with no task prints error', () => {
    const result = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --multi`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const parsed = JSON.parse(result.trim());
    assert.ok(parsed.error);
  });

  it('--enrich with no package.json prints plain index', () => {
    const enrichDir = path.join(__dirname, '..', '.code-review-cache', 'enrich-noctx');
    const enrichOut = path.join(enrichDir, 'noctx.json');
    try {
      fs.mkdirSync(path.join(enrichDir, 'bare-skill'), { recursive: true });
      fs.writeFileSync(path.join(enrichDir, 'bare-skill', 'SKILL.md'),
        '---\nname: bare-skill\ndescription: A bare skill\n---');
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --enrich "${enrichDir}" "${enrichOut}" "${enrichDir}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      assert.ok(result.includes('project context'));
    } finally {
      try { fs.rmSync(enrichDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('--semantic with no task prints error', () => {
    let result;
    try {
      result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --semantic`,
        { encoding: 'utf8', timeout: 5000 }
      );
    } catch (e) {
      result = e.stdout;
    }
    const parsed = JSON.parse(result.trim());
    assert.ok(parsed.error);
  });

  it('batch mode with empty skills file prints "No skills loaded"', () => {
    const emptyPath = path.join(__dirname, '..', '.code-review-cache', 'empty-skills.json');
    try {
      fs.writeFileSync(emptyPath, '[]', 'utf8');
      const result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" "test task" "${emptyPath}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
      assert.ok(result.includes('No skills loaded'));
    } finally {
      try { fs.unlinkSync(emptyPath); } catch {}
    }
  });
});

describe('validate (--validate CLI)', () => {
  const sandbox = path.join(__dirname, '..', '.code-review-cache', 'test-validate');

  beforeEach(() => {
    fs.mkdirSync(path.join(sandbox, 'valid-skill'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'valid-skill', 'SKILL.md'), `---
name: valid-skill
description: A valid skill for testing
---
`);
  });

  afterEach(() => {
    try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
  });

  it('reports valid for a correct SKILL.md', () => {
    const skillPath = path.join(sandbox, 'valid-skill', 'SKILL.md');
    const result = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --validate "${skillPath}"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const parsed = JSON.parse(result.trim());
    assert.strictEqual(parsed.valid, true);
  });

  it('reports invalid for missing SKILL.md', () => {
    let result;
    try {
      result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --validate "${path.join(sandbox, 'nonexistent', 'SKILL.md')}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
    } catch (e) {
      result = e.stdout;
    }
    const parsed = JSON.parse(result.trim());
    assert.strictEqual(parsed.valid, false);
    assert.ok(parsed.issues.length > 0);
  });

  it('reports invalid for SKILL.md without name field', () => {
    const badDir = path.join(sandbox, 'bad-skill');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'SKILL.md'), `---
description: missing name field
---
`);
    let result;
    try {
      result = require('child_process').execSync(
        `node "${path.join(__dirname, 'skill-matcher.js')}" --validate "${path.join(badDir, 'SKILL.md')}"`,
        { encoding: 'utf8', timeout: 5000 }
      );
    } catch (e) {
      result = e.stdout;
    }
    const parsed = JSON.parse(result.trim());
    assert.strictEqual(parsed.valid, false);
  });

  it('prints error when no path given', () => {
    const result = require('child_process').execSync(
      `node "${path.join(__dirname, 'skill-matcher.js')}" --validate`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const parsed = JSON.parse(result.trim());
    assert.ok(parsed.error);
  });
});

describe('clearCache', () => {
  const { clearCache, tokenize } = require('./skill-matcher');

  it('clears tokenize cache without breaking tokenize', () => {
    tokenize('hello world');
    clearCache();
    const result = tokenize('hello world');
    assert.deepStrictEqual(result, ['hello', 'world']);
  });
});

describe('scorer internals', () => {
  const { computeKeywordScore, computeTokenOverlapScore, intersection } = require('../src/scorer');

  describe('intersection', () => {
    it('returns elements present in both arrays', () => {
      assert.deepStrictEqual(intersection(['a', 'b', 'c'], ['b', 'd', 'e']), ['b']);
    });

    it('returns empty array when no overlap', () => {
      assert.deepStrictEqual(intersection(['a', 'b'], ['c', 'd']), []);
    });

    it('handles duplicates in input correctly', () => {
      assert.deepStrictEqual(intersection(['a', 'a', 'b'], ['a', 'c']), ['a', 'a']);
    });
  });

  describe('computeKeywordScore', () => {
    it('returns 0 when taskIntent has no domain/action/tech', () => {
      const intent = { domains: [], actions: [], technologies: [], keywords: ['foo'] };
      assert.strictEqual(computeKeywordScore(intent, ['foo', 'bar']), 0);
    });

    it('returns KEYWORD_SCORE_MAX (40) when all intent tokens match skill tokens', () => {
      const intent = { domains: ['frontend'], actions: ['debug'], technologies: ['react'], keywords: [] };
      assert.strictEqual(computeKeywordScore(intent, ['frontend', 'debug', 'react']), 40);
    });

    it('returns proportional score for partial match', () => {
      const intent = { domains: ['frontend'], actions: ['debug'], technologies: ['react'], keywords: [] };
      const score = computeKeywordScore(intent, ['frontend', 'react']);
      assert.strictEqual(score, 40 * (2 / 3));
    });

    it('returns 0 when skill tokens empty', () => {
      const intent = { domains: ['backend'], actions: ['fix'], technologies: ['python'], keywords: [] };
      assert.strictEqual(computeKeywordScore(intent, []), 0);
    });

    it('score never exceeds 40', () => {
      const intent = { domains: ['frontend', 'backend'], actions: ['debug', 'fix'], technologies: ['react', 'python'], keywords: [] };
      assert.ok(computeKeywordScore(intent, ['frontend', 'backend', 'debug', 'fix', 'react', 'python']) <= 40);
    });
  });

  describe('computeTokenOverlapScore', () => {
    it('returns 0 for empty task tokens', () => {
      assert.strictEqual(computeTokenOverlapScore([], 'any skill description'), 0);
    });

    it('returns SEMANTIC_SCORE_MAX (60) for full match', () => {
      assert.strictEqual(computeTokenOverlapScore(['debug', 'login'], 'debug login'), 60);
    });

    it('partial match returns proportional score', () => {
      assert.strictEqual(computeTokenOverlapScore(['debug', 'login', 'bug'], 'debug login'), 40);
    });

    it('word boundary matching: "test" does not match "testing"', () => {
      assert.strictEqual(computeTokenOverlapScore(['test'], 'unit testing framework'), 0);
    });

    it('score never exceeds 60', () => {
      assert.strictEqual(computeTokenOverlapScore(['a', 'b', 'c'], 'a b c'), 60);
    });
  });
});

describe('score integration', () => {
  const { score } = require('./skill-matcher');

  it('builds embedding map from enriched index and uses semantic score', async () => {
    const skills = [{ name: 'test', description: 'testing skill for validation' }];
    const computeSemantic = async (q, desc, cachedEmb) => {
      assert.ok(cachedEmb);
      assert.deepStrictEqual(cachedEmb, [0.1, 0.2]);
      return { score: 30, similarity: 0.5 };
    };
    const skillsIndex = { project: { language: 'node', framework: null, libraries: [], testingTools: [] }, skills: [{ name: 'test', description: 'testing skill for validation', embedding: [0.1, 0.2] }] };
    const results = await score(skills, 'test validation', { useSemantic: true, computeSemantic, skillsIndex });
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].name, 'test');
  });

  it('reranker promotes second-place candidate to first', async () => {
    const skills = [
      { name: 'alpha', description: 'Fix database queries and optimize SQL' },
      { name: 'beta', description: 'Write documentation and API guides' },
      { name: 'gamma', description: 'Design UI components and layouts' }
    ];
    let captured;
    const customReranker = async (top3) => {
      captured = top3.map(s => s.name);
      return { name: top3[1].name };
    };
    const results = await score(skills, 'fix the database query', { reranker: customReranker });
    assert.ok(captured);
    // alpha should be #1 (matches 'fix', 'database'), reranker picks #2 (beta)
    // beta should move to front after reorder
    assert.strictEqual(captured[0], 'alpha');
    assert.strictEqual(results[0].name, 'beta');
  });

  it('reranker error does not break scoring — retains original order', async () => {
    const skills = [
      { name: 'top', description: 'top matching skill for debugging' },
      { name: 'bottom', description: 'unrelated' }
    ];
    const brokenReranker = async () => { throw new Error('rerank fail'); };
    const results = await score(skills, 'debug top skill', { reranker: brokenReranker });
    assert.strictEqual(results[0].name, 'top');
  });
});

describe('reranker', () => {
  const { createReranker, rerankWithLLM, hasEnvConfig, buildRerankPrompt } = require('../src/reranker');

  describe('hasEnvConfig', () => {
    it('returns false when LLM_RERANK_API_KEY is not set', () => {
      const prev = process.env.LLM_RERANK_API_KEY;
      delete process.env.LLM_RERANK_API_KEY;
      assert.strictEqual(hasEnvConfig(), false);
      if (prev) process.env.LLM_RERANK_API_KEY = prev;
    });

    it('returns true when LLM_RERANK_API_KEY is set', () => {
      const prev = process.env.LLM_RERANK_API_KEY;
      process.env.LLM_RERANK_API_KEY = 'test-key';
      assert.strictEqual(hasEnvConfig(), true);
      if (prev) process.env.LLM_RERANK_API_KEY = prev; else delete process.env.LLM_RERANK_API_KEY;
    });
  });

  describe('buildRerankPrompt', () => {
    it('formats prompt with top3 skills and query', () => {
      const top3 = [
        { name: 'debug', score: 85, description: 'Debugging skill' },
        { name: 'test', score: 72, description: 'Testing skill' }
      ];
      const prompt = buildRerankPrompt(top3, 'fix login bug');
      assert.ok(prompt.includes('Task: fix login bug'));
      assert.ok(prompt.includes('1. debug (score: 85)'));
      assert.ok(prompt.includes('2. test (score: 72)'));
    });

    it('handles single candidate gracefully', () => {
      const prompt = buildRerankPrompt([{ name: 'debug', score: 85, description: 'Debug' }], 'test');
      assert.ok(prompt.includes('1. debug'));
      assert.ok(prompt.includes('Candidates'));
    });
  });

  describe('rerankWithLLM', () => {
    let originalFetch;

    beforeEach(() => { originalFetch = global.fetch; });
    afterEach(() => { global.fetch = originalFetch; });

    it('returns fallback for empty top3', async () => {
      const result = await rerankWithLLM([], 'test');
      assert.deepStrictEqual(result, { name: null, source: 'fallback' });
    });

    it('returns fallback when no API key set', async () => {
      const prev = process.env.LLM_RERANK_API_KEY;
      delete process.env.LLM_RERANK_API_KEY;
      const result = await rerankWithLLM([{ name: 'debug', score: 85, description: 'Debug' }], 'test');
      assert.deepStrictEqual(result, { name: 'debug', source: 'fallback' });
      if (prev) process.env.LLM_RERANK_API_KEY = prev;
    });

    it('returns llm-chosen skill when fetch succeeds', async () => {
      process.env.LLM_RERANK_API_KEY = 'test-key';
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'debug' } }] })
      });
      const result = await rerankWithLLM([{ name: 'debug', score: 85, description: 'Debug' }], 'test');
      assert.strictEqual(result.name, 'debug');
      assert.strictEqual(result.source, 'llm');
      delete process.env.LLM_RERANK_API_KEY;
    });

    it('falls back when API returns non-ok status', async () => {
      process.env.LLM_RERANK_API_KEY = 'test-key';
      global.fetch = async () => ({ ok: false, status: 500 });
      const result = await rerankWithLLM([{ name: 'debug', score: 85, description: 'Debug' }], 'test');
      assert.strictEqual(result.name, 'debug');
      assert.strictEqual(result.source, 'fallback');
      delete process.env.LLM_RERANK_API_KEY;
    });

    it('falls back when API returns non-matching skill name', async () => {
      process.env.LLM_RERANK_API_KEY = 'test-key';
      global.fetch = async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'nonexistent' } }] })
      });
      const result = await rerankWithLLM([{ name: 'debug', score: 85, description: 'Debug' }], 'test');
      assert.strictEqual(result.name, 'debug');
      assert.strictEqual(result.source, 'fallback');
      delete process.env.LLM_RERANK_API_KEY;
    });

    it('falls back when fetch throws', async () => {
      process.env.LLM_RERANK_API_KEY = 'test-key';
      global.fetch = async () => { throw new Error('network error'); };
      const result = await rerankWithLLM([{ name: 'debug', score: 85, description: 'Debug' }], 'test');
      assert.strictEqual(result.name, 'debug');
      assert.strictEqual(result.source, 'fallback');
      delete process.env.LLM_RERANK_API_KEY;
    });
  });

  describe('createReranker', () => {
    it('returns rerankWithLLM by default', () => {
      const { rerank } = createReranker();
      assert.strictEqual(rerank, rerankWithLLM);
    });

    it('uses custom rerank function when provided', () => {
      const custom = async () => ({ name: 'custom', source: 'custom' });
      const { rerank } = createReranker(custom);
      assert.strictEqual(rerank, custom);
    });
  });
});

describe('isPathAllowed (security)', () => {
  const { isPathAllowed } = require('../src/scanner');
  const os = require('os');

  it('allows paths within cwd', () => {
    const allowed = path.join(process.cwd(), 'data', 'known-skills.json');
    assert.strictEqual(isPathAllowed(allowed), true);
  });

  it('allows paths within home .agents directory', () => {
    const allowed = path.join(os.homedir(), '.agents', 'skills', 'test.json');
    assert.strictEqual(isPathAllowed(allowed), true);
  });

  it('allows paths within home .claude directory', () => {
    const allowed = path.join(os.homedir(), '.claude', 'skills', 'my-skill', 'SKILL.md');
    assert.strictEqual(isPathAllowed(allowed), true);
  });

  it('blocks /etc/passwd', () => {
    assert.strictEqual(isPathAllowed('/etc/passwd'), false);
  });

  it('blocks path traversal via ../../', () => {
    const traversal = path.join(process.cwd(), '..', '..', '..', '..', 'etc', 'passwd');
    assert.strictEqual(isPathAllowed(traversal), false);
  });

  it('blocks /tmp/../etc/passwd style traversal', () => {
    assert.strictEqual(isPathAllowed('/tmp/../etc/passwd'), false);
  });
});

describe('semantic-scorer', () => {
  const { cosineSimilarity, computeSkillHash, computeSemanticScore } = require('../src/index');

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      assert.strictEqual(cosineSimilarity([1, 0], [1, 0]), 1);
    });

    it('returns 0 for orthogonal vectors', () => {
      assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0);
    });

    it('returns 0 for mismatched lengths', () => {
      assert.strictEqual(cosineSimilarity([1, 0], [1]), 0);
    });

    it('returns 0 for zero vector', () => {
      assert.strictEqual(cosineSimilarity([0, 0], [1, 0]), 0);
    });

    it('returns value between 0 and 1 for partial similarity', () => {
      const sim = cosineSimilarity([1, 1], [1, 0]);
      assert.ok(sim > 0 && sim < 1);
    });

    it('handles negative values correctly', () => {
      const sim = cosineSimilarity([1, 0], [-1, 0]);
      assert.strictEqual(sim, -1);
    });
  });

  describe('computeSkillHash', () => {
    it('returns 64-char hex hash for existing file', () => {
      const hash = computeSkillHash(path.join(process.cwd(), 'SKILL.md'));
      assert.strictEqual(typeof hash, 'string');
      assert.strictEqual(hash.length, 64);
    });

    it('returns null for missing file', () => {
      assert.strictEqual(computeSkillHash('/nonexistent/file.md'), null);
    });
  });

  describe('computeSemanticScore', () => {
    it('returns a score between 0 and 60 without crashing', async () => {
      const result = await computeSemanticScore('fix login bug', 'debugging skill');
      assert.ok(result.score >= 0);
      assert.ok(result.score <= 60);
      assert.ok(typeof result.similarity === 'number');
    });
  });
});

describe('scanner uncovered paths', () => {
  const { extractSkillsFromData, buildSkillHash, loadSkills, walkForSubdir, getDefaultScanDirs, buildSkillIndex, detectProjectContext } = require('../src/scanner');
  const os = require('os');
  const scratchDir = path.join(process.cwd(), '.code-review-cache');

  describe('walkForSubdir', () => {
    const wfsDir = path.join(scratchDir, 'test-walkforsubdir');

    beforeEach(() => {
      fs.mkdirSync(path.join(wfsDir, 'sub-a', 'nested'), { recursive: true });
      fs.writeFileSync(path.join(wfsDir, 'sub-a', 'target.txt'), 'found');
      fs.mkdirSync(path.join(wfsDir, 'sub-b'), { recursive: true });
      fs.writeFileSync(path.join(wfsDir, 'sub-b', 'target.txt'), 'found');
      fs.mkdirSync(path.join(wfsDir, 'empty-dir'), { recursive: true });
    });

    afterEach(() => {
      try { fs.rmSync(wfsDir, { recursive: true, force: true }); } catch {}
    });

    it('finds target files in nested subdirectories', () => {
      const results = walkForSubdir(wfsDir, 'target.txt');
      assert.strictEqual(results.length, 2);
      assert.ok(results.every(r => r.endsWith('target.txt')));
    });

    it('skips node_modules and .git directories', () => {
      fs.mkdirSync(path.join(wfsDir, 'node_modules', 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(wfsDir, 'node_modules', 'target.txt'), 'should-skip');
      fs.mkdirSync(path.join(wfsDir, '.git', 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(wfsDir, '.git', 'target.txt'), 'should-skip');
      const results = walkForSubdir(wfsDir, 'target.txt');
      assert.ok(!results.some(r => r.includes('node_modules')));
      assert.ok(!results.some(r => r.includes('.git')));
    });

    it('returns empty array for non-existent root', () => {
      assert.deepStrictEqual(walkForSubdir(path.join(wfsDir, 'ghost'), 'target.txt'), []);
    });
  });

  describe('getDefaultScanDirs', () => {
    it('includes .agents/skills/ecc/skills when it exists', () => {
      const eccDir = path.join(os.homedir(), '.agents', 'skills', 'ecc', 'skills');
      const existed = fs.existsSync(eccDir);
      if (!existed) fs.mkdirSync(eccDir, { recursive: true });
      try {
        const dirs = getDefaultScanDirs();
        assert.ok(dirs.some(d => d.includes('ecc')));
      } finally {
        if (!existed) try { fs.rmSync(path.join(os.homedir(), '.agents', 'skills', 'ecc'), { recursive: true, force: true }); } catch {}
      }
    });
  });

  describe('loadSkills edge cases', () => {
    it('returns empty array for non-string customPath', () => {
      assert.deepStrictEqual(loadSkills(null), []);
      assert.deepStrictEqual(loadSkills(42), []);
    });

    it('blocks path traversal in loadSkills', () => {
      const traversal = path.join(process.cwd(), '..', '..', '..', '..', 'etc', 'passwd');
      assert.deepStrictEqual(loadSkills(traversal), []);
    });
  });

  describe('detectProjectContext', () => {
    const ctxDir = path.join(scratchDir, 'test-detect-ctx');

    beforeEach(() => { fs.mkdirSync(ctxDir, { recursive: true }); });
    afterEach(() => { try { fs.rmSync(ctxDir, { recursive: true, force: true }); } catch {} });

    it('detects Python Django project from pyproject.toml', () => {
      fs.writeFileSync(path.join(ctxDir, 'pyproject.toml'), '[project]\ndependencies = ["django"]\n', 'utf8');
      const ctx = detectProjectContext(ctxDir);
      assert.strictEqual(ctx.language, 'python');
      assert.strictEqual(ctx.framework, 'django');
    });

    it('detects Python FastAPI project', () => {
      fs.writeFileSync(path.join(ctxDir, 'pyproject.toml'), '[project]\ndependencies = ["fastapi", "sqlalchemy", "pytest"]\n', 'utf8');
      const ctx = detectProjectContext(ctxDir);
      assert.strictEqual(ctx.language, 'python');
      assert.strictEqual(ctx.framework, 'fastapi');
      assert.ok(ctx.libraries.includes('sqlalchemy'));
      assert.ok(ctx.testingTools.includes('pytest'));
    });

    it('detects Python Flask project', () => {
      fs.writeFileSync(path.join(ctxDir, 'pyproject.toml'), '[project]\ndependencies = ["flask"]\n', 'utf8');
      const ctx = detectProjectContext(ctxDir);
      assert.strictEqual(ctx.language, 'python');
      assert.strictEqual(ctx.framework, 'flask');
    });

    it('falls through from unparseable package.json to pyproject.toml', () => {
      fs.writeFileSync(path.join(ctxDir, 'package.json'), '{broken}', 'utf8');
      fs.writeFileSync(path.join(ctxDir, 'pyproject.toml'), '[project]\ndependencies = ["django"]\n', 'utf8');
      const ctx = detectProjectContext(ctxDir);
      assert.strictEqual(ctx.language, 'python');
    });

    it('detects Rust project from Cargo.toml', () => {
      fs.writeFileSync(path.join(ctxDir, 'Cargo.toml'), '[dependencies]\naxum = "0.7"\ndiesel = { version = "2", features = ["postgres"] }\n', 'utf8');
      const ctx = detectProjectContext(ctxDir);
      assert.strictEqual(ctx.language, 'rust');
      assert.strictEqual(ctx.framework, 'axum');
      assert.ok(ctx.libraries.includes('diesel'));
    });

    it('detects Go project from go.mod', () => {
      fs.writeFileSync(path.join(ctxDir, 'go.mod'), 'module example.com/app\ngo 1.22\nrequire github.com/gin-gonic/gin v1.9\n', 'utf8');
      const ctx = detectProjectContext(ctxDir);
      assert.strictEqual(ctx.language, 'go');
      assert.strictEqual(ctx.framework, 'gin');
    });
  });

  describe('buildSkillIndex edge cases', () => {
    const indexDir = path.join(scratchDir, 'test-build-index-edge');

    beforeEach(() => {
      fs.mkdirSync(path.join(indexDir, 'alpha'), { recursive: true });
      fs.writeFileSync(path.join(indexDir, 'alpha', 'SKILL.md'), '---\nname: alpha\ndescription: Alpha skill\n---\n');
    });

    afterEach(() => {
      try { fs.rmSync(indexDir, { recursive: true, force: true }); } catch {}
    });

    it('calls computeEmbeddings callback when provided', async () => {
      const outPath = path.join(indexDir, 'emb-index.json');
      let called = false;
      const embedFn = async (desc) => { called = true; return [0.1, 0.2, 0.3]; };
      const result = await buildSkillIndex(outPath, [indexDir], null, embedFn);
      assert.ok(called);
      assert.ok(result[0].embedding);
      assert.deepStrictEqual(result[0].embedding, [0.1, 0.2, 0.3]);
    });

    it('handles computeEmbeddings rejection gracefully', async () => {
      const outPath = path.join(indexDir, 'emb-fail-index.json');
      const embedFn = async () => { throw new Error('embed fail'); };
      const result = await buildSkillIndex(outPath, [indexDir], null, embedFn);
      assert.ok(result.length > 0);
      assert.strictEqual(result[0].embedding, undefined);
    });
  });

  describe('extractSkillsFromData', () => {
    it('extracts from { skills: [...] } envelope', () => {
      const data = { project: { language: 'node' }, skills: [{ name: 'test', description: 'testing' }] };
      const result = extractSkillsFromData(data);
      assert.ok(result);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, 'test');
    });

    it('returns null for envelope with invalid skills array', () => {
      const data = { project: {}, skills: [{ name: 'test' }] };
      assert.strictEqual(extractSkillsFromData(data), null);
    });

    it('returns null for envelope with non-array skills', () => {
      const data = { project: {}, skills: 'invalid' };
      assert.strictEqual(extractSkillsFromData(data), null);
    });

    it('returns null for plain object without skills key', () => {
      const data = { some: 'data' };
      assert.strictEqual(extractSkillsFromData(data), null);
    });

    it('returns null for null input', () => {
      assert.strictEqual(extractSkillsFromData(null), null);
    });
  });

  describe('buildSkillHash', () => {
    it('returns 16-char hash for existing file', () => {
      const hash = buildSkillHash(path.join(process.cwd(), 'SKILL.md'));
      assert.strictEqual(typeof hash, 'string');
      assert.strictEqual(hash.length, 16);
    });

    it('returns null for missing file', () => {
      assert.strictEqual(buildSkillHash('/nonexistent/SKILL.md'), null);
    });
  });

  describe('loadSkills with envelope', () => {
    const scratchDir = path.join(process.cwd(), '.code-review-cache');
    const envelopeFile = path.join(scratchDir, 'test-envelope-skills.json');

    beforeEach(() => {
      try { fs.mkdirSync(scratchDir, { recursive: true }); } catch {}
    });
    afterEach(() => {
      try { fs.unlinkSync(envelopeFile); } catch {}
    });

    it('loads skills from { skills: [...] } envelope file', () => {
      fs.writeFileSync(envelopeFile, JSON.stringify({ project: { language: 'node' }, skills: [{ name: 'env-test', description: 'test skill from envelope' }] }));
      const skills = loadSkills(envelopeFile);
      assert.strictEqual(skills.length, 1);
      assert.strictEqual(skills[0].name, 'env-test');
    });

    it('returns empty array for envelope file with invalid inner array', () => {
      fs.writeFileSync(envelopeFile, JSON.stringify({ project: {}, skills: [{ name: 'bad' }] }));
      const skills = loadSkills(envelopeFile);
      assert.strictEqual(skills.length, 0);
    });
  });
});

describe('logger', () => {
  const { logger } = require('../src/logger');

  it('logger.error calls console.error', () => {
    const calls = [];
    const orig = console.error;
    console.error = (...args) => { calls.push(args); };
    try {
      logger.error('test error');
      assert.ok(calls.length > 0);
    } finally {
      console.error = orig;
    }
  });
});

describe('validateSkill', () => {
  const { validateSkill } = require('./skill-matcher');
  const scratchDir = path.join(process.cwd(), '.code-review-cache');
  const tempSkillFile = path.join(scratchDir, 'SKILL.md');

  beforeEach(() => {
    try { fs.mkdirSync(scratchDir, { recursive: true }); } catch {}
  });
  afterEach(() => {
    try { fs.unlinkSync(tempSkillFile); } catch {}
  });

  it('returns valid for a well-formed SKILL.md', () => {
    const result = validateSkill(path.join(process.cwd(), 'SKILL.md'));
    assert.strictEqual(result.valid, true);
  });

  it('returns invalid for non-existent path', () => {
    const result = validateSkill('/nonexistent/SKILL.md');
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.length > 0);
  });

  it('returns invalid for non-SKILL.md file name', () => {
    const result = validateSkill(path.join(process.cwd(), 'package.json'));
    assert.strictEqual(result.valid, false);
    assert.ok(result.issues.some(i => i.includes('SKILL.md')));
  });

  it('returns invalid for missing name field', () => {
    const content = '---\n---\nSome content';
    fs.writeFileSync(tempSkillFile, content, 'utf8');
    const result = validateSkill(tempSkillFile);
    assert.strictEqual(result.valid, false);
  });

  it('returns invalid for whitespace-only name field', () => {
    const content = '---\nname:   \ndescription: test\n---\nContent';
    fs.writeFileSync(tempSkillFile, content, 'utf8');
    const result = validateSkill(tempSkillFile);
    assert.strictEqual(result.valid, false);
  });

  it('returns invalid when frontmatter is missing', () => {
    fs.writeFileSync(tempSkillFile, 'Just content without frontmatter', 'utf8');
    const result = validateSkill(tempSkillFile);
    assert.strictEqual(result.valid, false);
  });
});

describe('loadCatalog', () => {
  const { loadCatalog } = require('./skill-matcher');

  it('returns array of catalog entries', () => {
    const catalog = loadCatalog();
    assert.ok(Array.isArray(catalog));
    assert.ok(catalog.length > 0);
    assert.ok(catalog.every(e => e.name && e.description));
  });
});

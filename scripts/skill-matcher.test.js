'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter, discoverSkills } = require('./skill-matcher');

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
});

describe('extractIntent', () => {
  it('extracts domain, action, technology, keywords', () => {
    const result = extractIntent('debug react frontend auth timeout');
    assert.deepStrictEqual(result.domains, ['frontend']);
    assert.deepStrictEqual(result.actions, ['debug']);
    assert.deepStrictEqual(result.technologies, ['react']);
    assert.ok(result.keywords.includes('auth'));
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
});

describe('score', () => {
  const skills = [
    { name: 'diagnose', description: 'Debugging and fixing bugs and errors' },
    { name: 'tdd', description: 'Test-driven development for features and bugfixes' },
    { name: 'writing-plans', description: 'Creating implementation plans from requirements' }
  ];

  it('ranks skills by relevance', () => {
    const results = score(skills, 'debug the auth bug in the login flow');
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].name, 'diagnose');
    assert.ok(results[0].score >= results[1].score, 'results should be descending');
    assert.ok(results[1].score >= results[2].score, 'results should be descending');
  });

  it('returns scores between 0 and 100', () => {
    const results = score(skills, 'debug auth');
    for (const r of results) {
      assert.ok(r.score >= 0, `${r.name} score ${r.score} < 0`);
      assert.ok(r.score <= 100, `${r.name} score ${r.score} > 100`);
    }
  });

  it('returns empty array for empty skills', () => {
    assert.deepStrictEqual(score([], 'test'), []);
  });

  it('returns empty array for empty task', () => {
    assert.deepStrictEqual(score(skills, ''), []);
  });

  it('skips malformed skill entries', () => {
    const mixed = [
      { name: 'valid', description: 'a real skill' },
      null,
      { name: 'missing-desc' }
    ];
    const results = score(mixed, 'test task');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'valid');
  });

  it('handles very long input without crashing', () => {
    const long = 'a'.repeat(10000);
    const results = score(skills, long);
    assert.ok(Array.isArray(results));
  });

  it('returns bounded scores for known inputs', () => {
    const single = [{ name: 'test', description: 'debugging' }];
    const results = score(single, 'debug');
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].score >= 0);
    assert.ok(results[0].score <= 100);
  });

  it('returns details with correct shape and rounded integer values', () => {
    const results = score(skills, 'debug auth');
    for (const r of results) {
      assert.ok(r.details);
      assert.ok(typeof r.details.keywordScore === 'number');
      assert.ok(typeof r.details.semanticScore === 'number');
      assert.ok(Number.isInteger(r.details.keywordScore));
      assert.ok(Number.isInteger(r.details.semanticScore));
      assert.ok(r.details.keywordScore + r.details.semanticScore <= 100);
    }
  });

  it('handles hyphenated technology names in pipeline', () => {
    const skillsWithHyphen = [{ name: 'react', description: 'Build react apps' }];
    const results = score(skillsWithHyphen, 'build react frontend');
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
});

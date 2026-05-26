#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// MIT License - Copyright (c) 2026 - see LICENSE file

// --- Scoring constants ---
const KEYWORD_SCORE_MAX = 40;
const SEMANTIC_SCORE_MAX = 60;
const TOTAL_SCORE_MAX = 100;
const MAX_INPUT_LENGTH = 5000;
const MIN_TOKEN_LENGTH = 1;
const ALLOWED_BASE_DIR = path.resolve(process.cwd());
const SECURE_BASE_DIR = fs.realpathSync(ALLOWED_BASE_DIR);

// --- Domain/Action/Technology keyword lexicons ---
const DOMAIN_KEYWORDS = new Set([
  'frontend', 'backend', 'testing', 'design', 'data', 'docs', 'devops',
  'config', 'database', 'network', 'security', 'mobile', 'cli', 'api'
]);
const ACTION_KEYWORDS = new Set([
  'create', 'fix', 'migrate', 'refactor', 'debug', 'optimize', 'test', 'tests',
  'deploy', 'build', 'add', 'remove', 'update', 'rename', 'configure',
  'write', 'implement', 'make', 'setup'
]);
const TECH_KEYWORDS = new Set([
  'react', 'typescript', 'python', 'docker', 'supabase', 'node',
  'javascript', 'css', 'html', 'rust', 'go', 'java', 'ruby', 'postgres',
  'sql', 'vue', 'angular', 'svelte', 'next', 'nuxt'
]);

const tokenizeCache = new Map();

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','over','after','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will','would',
  'can','could','shall','should','may','might','must','it','its','this',
  'that','these','those','i','you','he','she','they','we','all','each',
  'every','some','any','no','not','only','just','very','too','so','if',
  'then','than','when','where','why','how','which','who','whom','what'
]);

/**
 * Normalize text into tokens: lowercase, strip non-alphanumeric, filter stop words.
 * @param {string} text — input string to tokenize
 * @returns {string[]} array of normalized tokens
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const cached = tokenizeCache.get(text);
  if (cached !== undefined) return cached;
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(w));
  tokenizeCache.set(text, tokens);
  return tokens;
}

/**
 * Extract structured intent (domain, action, technology, keywords) from task text.
 * @param {string} text — task description
 * @returns {{ domains: string[], actions: string[], technologies: string[], keywords: string[] }}
 */
function extractIntent(text) {
  const tokens = tokenize(text);
  return {
    domains: tokens.filter(t => DOMAIN_KEYWORDS.has(t)),
    actions: tokens.filter(t => ACTION_KEYWORDS.has(t)),
    technologies: tokens.filter(t => TECH_KEYWORDS.has(t)),
    keywords: tokens.filter(t =>
      !DOMAIN_KEYWORDS.has(t) && !ACTION_KEYWORDS.has(t) && !TECH_KEYWORDS.has(t)
    )
  };
}

function intersection(a, b) {
  const setB = new Set(b);
  return a.filter(x => setB.has(x));
}

/**
 * Compute keyword overlap score (0-40) matching domain/action/tech keywords.
 * @param {{ domains: string[], actions: string[], technologies: string[] }} taskIntent
 * @param {string[]} skillTokens — tokenized skill description
 * @returns {number} score 0-40
 */
function computeKeywordScore(taskIntent, skillTokens) {
  const domainMatch = intersection(taskIntent.domains, skillTokens).length;
  const actionMatch = intersection(taskIntent.actions, skillTokens).length;
  const techMatch = intersection(taskIntent.technologies, skillTokens).length;
  const totalIntent = taskIntent.domains.length + taskIntent.actions.length + taskIntent.technologies.length;
  const overlap = domainMatch + actionMatch + techMatch;
  return totalIntent > 0 ? Math.min(KEYWORD_SCORE_MAX, (overlap / totalIntent) * KEYWORD_SCORE_MAX) : 0;
}

/**
 * Compute token overlap score (0-60) via word-boundary match against skill description.
 * @param {string[]} taskTokens — keyword tokens from task description
 * @param {string} skillStr — raw skill description string
 * @returns {number} score 0-60
 */
function computeTokenOverlapScore(taskTokens, skillStr) {
  const cleaned = skillStr.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const skillWords = new Set(cleaned.split(/\s+/).filter(Boolean));
  const matchCount = taskTokens.filter(t => skillWords.has(t)).length;
  return Math.min(SEMANTIC_SCORE_MAX, (matchCount / Math.max(taskTokens.length, 1)) * SEMANTIC_SCORE_MAX);
}

/**
 * Score skills against a task description.
 * @param {Array<{name: string, description: string}>} skills
 * @param {string} taskText
 * @returns {Array<{name: string, score: number, details: {keywordScore: number, semanticScore: number}}>}
 */
function score(skills, taskText) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return [];
  }
  if (!taskText || typeof taskText !== 'string' || !taskText.trim()) {
    return [];
  }
  const text = taskText.length > MAX_INPUT_LENGTH ? taskText.slice(0, MAX_INPUT_LENGTH) : taskText;

  const taskIntent = extractIntent(text);
  const taskTokensList = taskIntent.keywords;
  const skillToDesc = (s) => s.description.toLowerCase();

  return skills.map(skill => {
    if (!skill || !skill.name || typeof skill.description !== 'string') return null;

    const skillTokenList = tokenize(skill.description);
    const keywordScore = computeKeywordScore(taskIntent, skillTokenList);
    const semanticScore = computeTokenOverlapScore(taskTokensList, skillToDesc(skill));
    const total = Math.max(0, Math.min(TOTAL_SCORE_MAX, Math.round(keywordScore + semanticScore)));

    return {
      name: skill.name,
      score: total,
      details: {
        keywordScore: Math.round(keywordScore),
        semanticScore: Math.round(semanticScore)
      }
    };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function isValidSkillsArray(data) {
  return Array.isArray(data) && data.every(s => s && s.name && typeof s.description === 'string');
}

function extractSkillsFromData(data) {
  if (isValidSkillsArray(data)) return data;
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.skills)) {
    if (isValidSkillsArray(data.skills)) return data.skills;
  }
  return null;
}

function isPathAllowed(targetPath) {
  const resolved = fs.realpathSync(targetPath);
  const relative = path.relative(SECURE_BASE_DIR, resolved);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Load skills from custom path, SKILLS_JSON env var, or return empty array.
 * @param {string} [customPath] — optional path to JSON file with skills array
 * @returns {Array<{name: string, description: string}>}
 */
function loadSkills(customPath) {
  if (customPath) {
    try {
      if (typeof customPath !== 'string') {
        console.warn('loadSkills: customPath must be a string');
        return [];
      }
      const resolvedPath = path.resolve(customPath);
      if (!isPathAllowed(resolvedPath)) {
        console.warn(`loadSkills: path traversal blocked for ${customPath}`);
        return [];
      }
      const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      const extracted = extractSkillsFromData(data);
      if (extracted) return extracted;
      console.warn(`loadSkills: invalid skills array in ${customPath}`);
      return [];
    } catch (err) {
      console.warn(`loadSkills: error reading ${customPath} — ${err.message}`);
      return [];
    }
  }

  const envJson = process.env.SKILLS_JSON;
  if (envJson) {
    try {
      const data = JSON.parse(envJson);
      if (isValidSkillsArray(data)) {
        return data;
      }
      console.warn('loadSkills: SKILLS_JSON does not contain a valid skills array');
    } catch (err) {
      console.warn(`loadSkills: SKILLS_JSON parse error — ${err.message}`);
    }
    return [];
  }

  return [];
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * @param {string} content — raw file content
 * @returns {{ name: string, description: string } | null}
 */
function parseSkillFrontmatter(content) {
  if (!content || typeof content !== 'string') return null;
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const yaml = match[1];
  const name = yaml.match(/^name:\s*(.+)$/m);
  const description = yaml.match(/^description:\s*(.+)$/m);
  if (!name || !description) return null;
  return { name: name[1].trim(), description: description[1].trim() };
}

/**
 * Discover skills by scanning directories for SKILL.md files.
 * @param {string[]} [dirs] — directories to scan (default: common skill locations)
 * @returns {Array<{name: string, description: string}>}
 */
function walkForSubdir(root, target) {
  const results = [];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(root, e.name);
      const candidate = path.join(full, target);
      if (fs.existsSync(candidate)) {
        results.push(candidate);
      } else {
        results.push(...walkForSubdir(full, target));
      }
    }
  } catch {}
  return results;
}

function getDefaultScanDirs() {
  const dirs = [
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.config', 'opencode', 'skills'),
    path.join(os.homedir(), '.claude', 'skills')
  ];
  const userAgentsSkills = path.join(os.homedir(), '.agents', 'skills');
  const eccSkills = path.join(userAgentsSkills, 'ecc', 'skills');
  if (fs.existsSync(eccSkills)) dirs.push(eccSkills);
  const cacheBase = path.join(os.homedir(), '.cache', 'opencode', 'packages');
  try {
    const found = walkForSubdir(cacheBase, path.join('node_modules', 'superpowers', 'skills'));
    dirs.push(...found);
  } catch {}
  return dirs;
}

function scanDirForSkills(dir, seen, collector) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(dir, entry.name, 'SKILL.md');
    let content;
    try {
      content = fs.readFileSync(skillPath, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseSkillFrontmatter(content);
    if (parsed && !seen.has(parsed.name)) {
      seen.add(parsed.name);
      collector.push(parsed);
    }
  }
}

/**
 * Discover skills by scanning directories for SKILL.md files.
 * @param {string[]} [dirs] — directories to scan (default: common skill locations)
 * @returns {Array<{name: string, description: string}>}
 */
function discoverSkills(dirs) {
  const searchDirs = Array.isArray(dirs) && dirs.length > 0 ? dirs : getDefaultScanDirs();
  const seen = new Set();
  const skills = [];

  for (const dir of searchDirs) {
    scanDirForSkills(dir, seen, skills);
  }
  return skills;
}

/**
 * Detect project language, framework, and libraries from project files.
 * @param {string} [projectDir] — project root to analyze (default: cwd)
 * @returns {{ language: string|null, framework: string|null, libraries: string[], testingTools: string[] }}
 */
function detectProjectContext(projectDir) {
  const ctx = { language: null, framework: null, libraries: [], testingTools: [] };
  const dir = projectDir || process.cwd();

  // package.json (Node.js)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    ctx.language = 'node';
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depNames = Object.keys(allDeps);

    if (depNames.includes('next')) ctx.framework = 'next';
    else if (depNames.includes('react')) ctx.framework = 'react';
    else if (depNames.includes('vue')) ctx.framework = 'vue';
    else if (depNames.includes('nuxt')) ctx.framework = 'nuxt';
    else if (depNames.includes('svelte')) ctx.framework = 'svelte';
    else if (depNames.includes('@nestjs/core')) ctx.framework = 'nest';
    else if (depNames.includes('express')) ctx.framework = 'express';
    else if (depNames.includes('fastify')) ctx.framework = 'fastify';
    else if (depNames.includes('angular')) ctx.framework = 'angular';

    for (const lib of ['prisma','supabase','stripe','tailwindcss','trpc','graphql','zustand','redux','playwright','cypress']) {
      if (depNames.includes(lib)) ctx.libraries.push(lib);
    }
    for (const t of ['jest','vitest','mocha','cypress','playwright']) {
      if (depNames.includes(t)) ctx.testingTools.push(t);
    }
    return ctx;
  } catch {}

  // pyproject.toml (Python)
  try {
    const content = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
    ctx.language = 'python';
    if (content.includes('django')) ctx.framework = 'django';
    else if (content.includes('fastapi')) ctx.framework = 'fastapi';
    else if (content.includes('flask')) ctx.framework = 'flask';
    for (const lib of ['sqlalchemy','alembic','celery','redis','pytest']) {
      if (content.includes(lib)) ctx.libraries.push(lib);
    }
    if (content.includes('pytest')) ctx.testingTools.push('pytest');
    return ctx;
  } catch {}

  // Cargo.toml (Rust)
  try {
    const content = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
    ctx.language = 'rust';
    if (content.includes('axum')) ctx.framework = 'axum';
    else if (content.includes('actix-web')) ctx.framework = 'actix-web';
    else if (content.includes('rocket')) ctx.framework = 'rocket';
    for (const lib of ['diesel','sqlx','tokio','serde']) {
      if (content.includes(lib)) ctx.libraries.push(lib);
    }
    return ctx;
  } catch {}

  // go.mod (Go)
  try {
    const content = fs.readFileSync(path.join(dir, 'go.mod'), 'utf8');
    ctx.language = 'go';
    if (content.includes('gin')) ctx.framework = 'gin';
    else if (content.includes('echo')) ctx.framework = 'echo';
    else if (content.includes('fiber')) ctx.framework = 'fiber';
    return ctx;
  } catch {}

  return ctx;
}

/**
 * Scan skill directories and write a lightweight skills index with paths.
 * @param {string} [outputPath] — path for .skills-index.json (default: cwd/.skills-index.json)
 * @param {string[]} [scanDirs] — directories to scan (default: common skill locations)
 * @param {object} [projectContext] — optional project context to embed in the index
 * @returns {Array<{name: string, description: string, path: string}>}
 */
function buildSkillIndex(outputPath, scanDirs, projectContext) {
  const searchDirs = Array.isArray(scanDirs) && scanDirs.length > 0 ? scanDirs : getDefaultScanDirs();
  const seen = new Set();
  const index = [];

  for (const dir of searchDirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(dir, entry.name, 'SKILL.md');
      let content;
      try {
        content = fs.readFileSync(skillPath, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseSkillFrontmatter(content);
      if (parsed && !seen.has(parsed.name)) {
        seen.add(parsed.name);
        index.push({ name: parsed.name, description: parsed.description, path: skillPath });
      }
    }
  }

  const out = outputPath || path.join(process.cwd(), '.skills-index.json');
  const output = projectContext
    ? { project: projectContext, skills: index }
    : index;
  fs.writeFileSync(out, JSON.stringify(output, null, 2), 'utf8');
  return output;
}

/**
 * Score a task against all discovered skills and print results.
 * @param {string} taskText
 * @param {string[]} [scanDirs]
 * @returns {boolean}
 */
function scanAndScore(taskText, scanDirs) {
  const skills = discoverSkills(scanDirs);
  if (skills.length === 0) {
    console.log('No skills discovered in any skill directory.');
    return false;
  }
  const results = score(skills, taskText);
  if (results.length === 0) {
    console.log('No skills matched.');
    return false;
  }
  console.log(`Scanned ${skills.length} skills. Best match: ${results[0].name} (${results[0].score}/100)`);
  console.log(JSON.stringify(results, null, 2));
  return true;
}

function printScore(taskText, customPath) {
  const skills = loadSkills(customPath);
  if (skills.length === 0) {
    console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
    return false;
  }
  const results = score(skills, taskText);
  console.log(JSON.stringify(results, null, 2));
  return true;
}

const AGENTS_MD_HOOK = `## Global Session Start

ALWAYS invoke the \`auto-skill-select\` skill at the very start of every session (before any other action or clarifying question), AND re-invoke it before EVERY new task mid-session. Do not skip re-invocation — even if you remember the previous match. Task context changes; the skill match should too. The task layer loads one or more skills depending on score: single if >90, multi if 70-90.

You MUST follow Karpathy Guidelines (loaded via instructions) for every response: think before coding, simplicity first, surgical changes, goal-driven execution.
`;

const AGENTS_MD_CHECK = 'auto-skill-select';

/**
 * Check and setup AGENTS.md with auto-invoke hook.
 * @param {string} [agentsPath] — path to AGENTS.md (default: ~/.config/opencode/AGENTS.md)
 * @returns {{ status: string, path: string }}
 */
function setupAgentsMd(agentsPath) {
  const target = agentsPath || path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md');
  let content;
  try {
    content = fs.readFileSync(target, 'utf8');
  } catch {
    // File doesn't exist — create it
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, AGENTS_MD_HOOK, 'utf8');
    return { status: 'created', path: target };
  }

  if (content.includes(AGENTS_MD_CHECK)) {
    return { status: 'already-present', path: target };
  }

  fs.writeFileSync(target, content.trimEnd() + '\n\n' + AGENTS_MD_HOOK, 'utf8');
  return { status: 'appended', path: target };
}

function printMultiScore(taskText, customPath, threshold) {
  const skills = loadSkills(customPath);
  if (skills.length === 0) {
    console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
    return false;
  }
  const results = score(skills, taskText);
  const filtered = results.filter(r => r.score >= threshold);
  if (filtered.length === 0) {
    console.log(JSON.stringify({ threshold, count: 0, message: `No skills scored >= ${threshold}`, results }, null, 2));
    return true;
  }
  console.log(JSON.stringify({ threshold, count: filtered.length, results: filtered }, null, 2));
  return true;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('error', () => {
      rl.close();
      process.exit(1);
    });
    rl.question('Describe the task: ', input => {
      if (!input || !input.trim()) {
        console.log('No task entered. Exiting.');
        rl.close();
        return;
      }
      printScore(input.trim());
      rl.close();
    });
    return;
  }

  if (args[0] === '--multi' || args[0] === '-m') {
    const thresholdIdx = args.indexOf('--threshold') !== -1 ? args.indexOf('--threshold') : args.indexOf('-t');
    const threshold = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : 70;
    const nonFlagArgs = args.filter((a, i) => {
      if (a === '--multi' || a === '-m') return false;
      if (a === '--threshold' || a === '-t') return false;
      if (thresholdIdx !== -1 && (i === thresholdIdx + 1)) return false;
      return true;
    });
    const taskText = nonFlagArgs[0];
    const indexPath = nonFlagArgs[1];
    if (!taskText) {
      console.log(JSON.stringify({ error: 'Task text required after --multi' }));
      return;
    }
    printMultiScore(taskText, indexPath, threshold);
    return;
  }

  if (args[0] === '--scan' || args[0] === '-s') {
    const taskText = args[1];
    const scanDirs = args[2] ? [args[2]] : undefined;
    if (!taskText) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.on('error', () => {
        rl.close();
        process.exit(1);
      });
      rl.question('Describe the task: ', input => {
        if (!input || !input.trim()) {
          console.log('No task entered. Exiting.');
          rl.close();
          return;
        }
        scanAndScore(input.trim(), scanDirs);
        rl.close();
      });
      return;
    }
    scanAndScore(taskText, scanDirs);
    return;
  }

  if (args[0] === '--index' || args[0] === '-i') {
    const outputPath = args[1] ? path.resolve(args[1]) : undefined;
    const scanDirs = args[2] ? [args[2]] : undefined;
    const count = buildSkillIndex(outputPath, scanDirs).length;
    console.log(`Indexed ${count} skills → ${outputPath || path.join(process.cwd(), '.skills-index.json')}`);
    return;
  }

  if (args[0] === '--setup') {
    const result = setupAgentsMd(args[1] ? path.resolve(args[1]) : undefined);
    if (result.status === 'already-present') {
      console.log(`✓ auto-skill-select hook already present in ${result.path}`);
    } else if (result.status === 'created') {
      console.log(`✓ Created ${result.path} with auto-skill-select hook`);
    } else {
      console.log(`✓ Appended auto-skill-select hook to ${result.path}`);
    }
    return;
  }

  if (args[0] === '--enrich' || args[0] === '-e') {
    const projectDir = args[1] ? path.resolve(args[1]) : undefined;
    const outputPath = args[2] ? path.resolve(args[2]) : undefined;
    const scanDirs = args[3] ? [args[3]] : undefined;
    const ctx = detectProjectContext(projectDir);
    const output = buildSkillIndex(outputPath, scanDirs, ctx);
    const count = output.skills.length;
    console.log(`Indexed ${count} skills with project context → ${outputPath || path.join(process.cwd(), '.skills-index.json')}`);
    if (ctx.language) console.log(`  ${ctx.language}${ctx.framework ? '/' + ctx.framework : ''}${ctx.libraries.length > 0 ? ' [' + ctx.libraries.join(', ') + ']' : ''}`);
    return;
  }

  printScore(args[0], args[1]);
}

if (require.main === module) main();
module.exports = { score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter, discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd };

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
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
  'create', 'fix', 'migrate', 'refactor', 'debug', 'optimize', 'test',
  'deploy', 'build', 'add', 'remove', 'update', 'rename', 'configure'
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
  const skillWords = new Set(skillStr.toLowerCase().split(/\s+/));
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
      if (isValidSkillsArray(data)) {
        return data;
      }
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

  printScore(args[0], args[1]);
}

if (require.main === module) main();
module.exports = { score, tokenize, loadSkills, extractIntent };

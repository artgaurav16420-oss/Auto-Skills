'use strict';

const fs = require('fs');
const path = require('path');

const { MAX_LRU_CACHE_SIZE } = require('./constants');

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

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','over','after','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will','would',
  'can','could','shall','should','may','might','must','it','its','this',
  'that','these','those','i','you','he','she','they','we','all','each',
  'every','some','any','no','not','only','just','very','too','so','if',
  'then','than','when','where','why','how','which','who','whom','what'
]);

const MIN_TOKEN_LENGTH = 1;

const tokenizeCache = new Map();

let synonymsMap = null;

/**
 * Load synonyms from data/synonyms.json (lazy, cached).
 * @returns {Record<string, string[]>}
 */
function loadSynonyms() {
  if (synonymsMap) return synonymsMap;
  try {
    const synonymsPath = path.join(__dirname, '..', 'data', 'synonyms.json');
    synonymsMap = JSON.parse(fs.readFileSync(synonymsPath, 'utf8'));
  } catch {
    synonymsMap = {};
  }
  return synonymsMap;
}

/**
 * Expand a token using the synonyms map.
 * @param {string} token
 * @returns {string[]} [original, ...synonyms]
 */
function expandToken(token) {
  const synonyms = loadSynonyms();
  const expanded = synonyms[token];
  if (!expanded) return [token];
  return [token, ...expanded.filter(s => s !== token)];
}

/**
 * Expand all tokens in an array using the synonyms map.
 * @param {string[]} tokens
 * @returns {string[]}
 */
function expandTokens(tokens) {
  const result = [];
  for (const t of tokens) {
    result.push(...expandToken(t));
  }
  return result;
}

function clearCache() {
  tokenizeCache.clear();
}

/**
 * Reset the synonyms cache (useful for testing).
 */
function resetSynonyms() {
  synonymsMap = null;
}

/**
 * Normalize text into tokens: lowercase, strip non-alphanumeric, filter stop words.
 * Uses an LRU-bounded cache (max 1000 entries) to avoid unbounded memory growth.
 * @param {string} text — input string to tokenize
 * @param {object} [opts] — options
 * @param {boolean} [opts.expandSynonyms=false] — expand tokens via synonyms map
 * @returns {string[]} array of normalized tokens
 */
function tokenize(text, opts) {
  if (!text || typeof text !== 'string') return [];
  const cacheKey = opts?.expandSynonyms ? text + ':syn' : text;
  const cached = tokenizeCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(w));

  if (opts?.expandSynonyms) {
    tokens = expandTokens(tokens);
  }

  if (tokenizeCache.size >= MAX_LRU_CACHE_SIZE) {
    const firstKey = tokenizeCache.keys().next().value;
    if (firstKey !== undefined) tokenizeCache.delete(firstKey);
  }
  tokenizeCache.set(cacheKey, tokens);
  return tokens;
}

/**
 * Extract structured intent (domain, action, technology, keywords) from task text.
 * @param {string} text — task description
 * @returns {{ domains: string[], actions: string[], technologies: string[], keywords: string[] }}
 */
function extractIntent(text) {
  const tokens = tokenize(text, { expandSynonyms: true });
  return {
    domains: tokens.filter(t => DOMAIN_KEYWORDS.has(t)),
    actions: tokens.filter(t => ACTION_KEYWORDS.has(t)),
    technologies: tokens.filter(t => TECH_KEYWORDS.has(t)),
    keywords: tokens.filter(t =>
      !DOMAIN_KEYWORDS.has(t) && !ACTION_KEYWORDS.has(t) && !TECH_KEYWORDS.has(t)
    )
  };
}

module.exports = {
  tokenize, extractIntent, clearCache, resetSynonyms,
  expandToken, expandTokens, loadSynonyms,
  DOMAIN_KEYWORDS, ACTION_KEYWORDS, TECH_KEYWORDS, STOP_WORDS,
  MIN_TOKEN_LENGTH, tokenizeCache
};

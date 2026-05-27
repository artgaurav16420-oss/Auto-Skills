'use strict';

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

function clearCache() {
  tokenizeCache.clear();
}

/**
 * Normalize text into tokens: lowercase, strip non-alphanumeric, filter stop words.
 * Uses an LRU-bounded cache (max 1000 entries) to avoid unbounded memory growth.
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

  if (tokenizeCache.size >= MAX_LRU_CACHE_SIZE) {
    const firstKey = tokenizeCache.keys().next().value;
    if (firstKey !== undefined) tokenizeCache.delete(firstKey);
  }
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

module.exports = {
  tokenize, extractIntent, clearCache,
  DOMAIN_KEYWORDS, ACTION_KEYWORDS, TECH_KEYWORDS, STOP_WORDS,
  MIN_TOKEN_LENGTH, tokenizeCache
};

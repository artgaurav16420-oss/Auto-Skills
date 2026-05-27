'use strict';

const { tokenize, extractIntent } = require('./tokenizer');
const { KEYWORD_SCORE_MAX, SEMANTIC_SCORE_MAX, TOTAL_SCORE_MAX, MAX_INPUT_LENGTH } = require('./constants');

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
 * Rounds keywordScore and semanticScore individually BEFORE summing
 * so that displayed_keyword + displayed_semantic === total.
 *
 * When useSemantic is true and a skillsIndex is provided, computes a
 * hybrid score: 0.3 * keywordScore + 0.7 * semanticScore (both normalized to 0-100).
 * The semantic score uses Transformer embeddings cached in the index.
 *
 * @param {Array<{name: string, description: string}>} skills
 * @param {string} taskText
 * @param {object} [options]
 * @param {boolean} [options.useSemantic=false] — enable transformer-based semantic scoring
 * @param {object} [options.skillsIndex] — enriched index with { project, skills: [{ name, description, embedding }] }
 * @param {Function} [options.computeSemantic] — async function (query, desc, cachedEmb) => { score, similarity }
 * @returns {Array<{name: string, score: number, details: {keywordScore: number, semanticScore: number, similarity?: number}}>}
 */
async function score(skills, taskText, options) {
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

  const useSemantic = !!(options?.useSemantic && options?.computeSemantic);

  // Build a lookup for cached embeddings if an index is provided
  let embeddingMap = null;
  if (options?.skillsIndex?.skills) {
    embeddingMap = new Map();
    for (const entry of options.skillsIndex.skills) {
      if (entry.embedding) {
        embeddingMap.set(entry.name, entry.embedding);
      }
    }
  }

  const results = await Promise.all(skills.map(async skill => {
    if (!skill || !skill.name || typeof skill.description !== 'string') return null;

    const skillTokenList = tokenize(skill.description);
    const rawKeywordScore = computeKeywordScore(taskIntent, skillTokenList);
    const rawTokenOverlap = computeTokenOverlapScore(taskTokensList, skillToDesc(skill));
    const roundedKeyword = Math.round(rawKeywordScore);
    const roundedTokenOverlap = Math.round(rawTokenOverlap);

    if (useSemantic) {
      const cachedEmb = embeddingMap?.get(skill.name);
      const semResult = await options.computeSemantic(text, skill.description, cachedEmb);
      const rawSemScore = semResult.score;
      const roundedSem = Math.round(rawSemScore);

      // Hybrid: 0.3 * keyword (0-40 mapped to 0-100) + 0.7 * semantic (0-60 mapped to 0-100)
      const keywordNormalized = (roundedKeyword / KEYWORD_SCORE_MAX) * 100;
      const semNormalized = (roundedSem / SEMANTIC_SCORE_MAX) * 100;
      const hybrid = Math.round(0.3 * keywordNormalized + 0.7 * semNormalized);
      const total = Math.max(0, Math.min(TOTAL_SCORE_MAX, hybrid));

      return {
        name: skill.name,
        score: total,
        details: {
          keywordScore: roundedKeyword,
          semanticScore: roundedSem,
          tokenOverlap: roundedTokenOverlap,
          similarity: semResult.similarity !== null && semResult.similarity !== undefined ? Math.round(semResult.similarity * 1000) / 1000 : undefined
        }
      };
    }

    const total = Math.max(0, Math.min(TOTAL_SCORE_MAX, roundedKeyword + roundedTokenOverlap));
    return {
      name: skill.name,
      score: total,
      details: {
        keywordScore: roundedKeyword,
        semanticScore: roundedTokenOverlap
      }
    };
  }));

  return results
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

module.exports = { score, computeKeywordScore, computeTokenOverlapScore, intersection };

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
    const rawKeywordScore = computeKeywordScore(taskIntent, skillTokenList);
    const rawSemanticScore = computeTokenOverlapScore(taskTokensList, skillToDesc(skill));
    const roundedKeyword = Math.round(rawKeywordScore);
    const roundedSemantic = Math.round(rawSemanticScore);
    const total = Math.max(0, Math.min(TOTAL_SCORE_MAX, roundedKeyword + roundedSemantic));

    return {
      name: skill.name,
      score: total,
      details: {
        keywordScore: roundedKeyword,
        semanticScore: roundedSemantic
      }
    };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

module.exports = { score, computeKeywordScore, computeTokenOverlapScore, intersection };

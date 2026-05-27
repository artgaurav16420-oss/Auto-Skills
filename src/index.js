'use strict';

const { score } = require('./scorer');
const { tokenize, extractIntent, clearCache, resetSynonyms, loadSynonyms } = require('./tokenizer');
const { loadSkills, parseSkillFrontmatter, discoverSkills, buildSkillIndex, detectProjectContext } = require('./scanner');
const { setupAgentsMd } = require('./setup');
const { computeSemanticScore, computeEmbedding, cosineSimilarity, computeSkillHash } = require('./semantic-scorer');
const { createReranker } = require('./reranker');

module.exports = {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd,
  clearCache, resetSynonyms, loadSynonyms,
  computeSemanticScore, computeEmbedding, cosineSimilarity, computeSkillHash,
  createReranker
};

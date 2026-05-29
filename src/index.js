'use strict';

const { score } = require('./scorer');
const { tokenize, extractIntent, clearCache, resetSynonyms, loadSynonyms } = require('./tokenizer');
const { loadSkills, parseSkillFrontmatter, discoverSkills, buildSkillIndex, detectProjectContext } = require('./scanner');
const { setupAgentsMd, setupOpencodeJsonc } = require('./setup');
const { createReranker } = require('./reranker');
const { logger } = require('./logger');

let _semantic = null;
function getSemantic() {
  if (!_semantic) {
    try {
      _semantic = require('./semantic-scorer');
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        logger.warn('semantic-scorer not available; semantic features disabled.');
        _semantic = { computeSemanticScore: null, computeEmbedding: null, cosineSimilarity: null, computeSkillHash: null };
      } else {
        throw err;
      }
    }
  }
  return _semantic;
}

module.exports = {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd, setupOpencodeJsonc,
  clearCache, resetSynonyms, loadSynonyms,
  createReranker,
  get computeSemanticScore() { return getSemantic().computeSemanticScore; },
  get computeEmbedding() { return getSemantic().computeEmbedding; },
  get cosineSimilarity() { return getSemantic().cosineSimilarity; },
  get computeSkillHash() { return getSemantic().computeSkillHash; }
};

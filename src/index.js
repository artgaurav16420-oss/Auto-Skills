'use strict';

const { score } = require('./scorer');
const { tokenize, extractIntent, clearCache, resetSynonyms, loadSynonyms } = require('./tokenizer');
const { loadSkills, parseSkillFrontmatter, discoverSkills, buildSkillIndex, detectProjectContext } = require('./scanner');
const { setupAgentsMd } = require('./setup');
const { createReranker } = require('./reranker');

let _semantic = null;
function getSemantic() {
  if (!_semantic) {
    try {
      _semantic = require('./semantic-scorer');
    } catch {
      _semantic = { computeSemanticScore: null, computeEmbedding: null, cosineSimilarity: null, computeSkillHash: null };
    }
  }
  return _semantic;
}

module.exports = {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd,
  clearCache, resetSynonyms, loadSynonyms,
  createReranker,
  get computeSemanticScore() { return getSemantic().computeSemanticScore; },
  get computeEmbedding() { return getSemantic().computeEmbedding; },
  get cosineSimilarity() { return getSemantic().cosineSimilarity; },
  get computeSkillHash() { return getSemantic().computeSkillHash; }
};

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { logger } = require('./logger');
const { SEMANTIC_SCORE_MAX } = require('./constants');

const EMBEDDING_CACHE_MAX = 500;

let featureExtractorPromise = null;
const embeddingCache = new Map();

/**
 * Get or initialize the feature extraction pipeline (lazy singleton).
 * Stores the in-flight promise to prevent concurrent parallel loads.
 * @returns {Promise<Function>} pipeline function
 */
async function getFeatureExtractor() {
  if (featureExtractorPromise) return featureExtractorPromise;
  featureExtractorPromise = (async () => {
    try {
      const { pipeline } = require('@huggingface/transformers');
      logger.debug('Loading all-MiniLM-L6-v2 model...');
      const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
      logger.debug('Model loaded successfully.');
      return extractor;
    } catch (err) {
      logger.error(`Failed to load feature-extraction model: ${err.message}`);
      featureExtractorPromise = null;
      throw err;
    }
  })();
  return featureExtractorPromise;
}

/**
 * Compute cosine similarity between two vectors.
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} -1.0 to 1.0
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Compute embedding vector for a text string.
 * Caches results by text content (LRU, max 500).
 * @param {string} text
 * @returns {Promise<number[]>} embedding vector
 */
async function computeEmbedding(text) {
  const cached = embeddingCache.get(text);
  if (cached !== undefined) {
    embeddingCache.delete(text);
    embeddingCache.set(text, cached);
    return cached;
  }

  const pipe = await getFeatureExtractor();
  const result = await pipe(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(result.data);

  if (embeddingCache.size >= EMBEDDING_CACHE_MAX) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(text, embedding);
  return embedding;
}

/**
 * Compute a content hash for a skill to detect changes.
 * @param {string} skillPath
 * @returns {string|null} hex hash or null if file can't be read
 */
function computeSkillHash(skillPath) {
  try {
    const content = fs.readFileSync(skillPath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Compute semantic score (0-60) between query text and skill description.
 * Uses cosine similarity of all-MiniLM-L6-v2 embeddings.
 * @param {string} query — the user's task text
 * @param {string} description — the skill's description
 * @param {number[]} [cachedEmbedding] — optional pre-computed embedding for the description
 * @returns {Promise<{score: number, similarity: number}>}
 */
async function computeSemanticScore(query, description, cachedEmbedding) {
  try {
    const queryEmbedding = await computeEmbedding(query);
    const descEmbedding = cachedEmbedding || await computeEmbedding(description);
    const similarity = cosineSimilarity(queryEmbedding, descEmbedding);
    const score = Math.round(similarity * SEMANTIC_SCORE_MAX);
    return { score: Math.max(0, Math.min(SEMANTIC_SCORE_MAX, score)), similarity };
  } catch (err) {
    logger.debug(`computeSemanticScore error: ${err.message}`);
    return { score: 0, similarity: 0 };
  }
}

module.exports = {
  computeSemanticScore, computeEmbedding, cosineSimilarity,
  computeSkillHash, getFeatureExtractor
};

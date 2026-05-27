'use strict';

const { logger } = require('./logger');

const RERANK_API_KEY_ENV = 'LLM_RERANK_API_KEY';
const RERANK_MODEL_ENV = 'LLM_RERANK_MODEL';
const RERANK_ENDPOINT_ENV = 'LLM_RERANK_ENDPOINT';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

const hasEnvConfig = () => {
  return !!(process.env[RERANK_API_KEY_ENV]);
};

/**
 * Build a system prompt for the reranker.
 * @param {Array<{name: string, score: number, description: string}>} top3
 * @param {string} query
 * @returns {string}
 */
function buildRerankPrompt(top3, query) {
  const candidates = top3.map((s, i) =>
    `${i + 1}. ${s.name} (score: ${s.score}) — ${s.description}`
  ).join('\n');

  return [
    'You are a skill-routing assistant. Given a user task and ranked candidate skills,',
    'select the single best skill for the task. Respond with ONLY the skill name, nothing else.',
    '',
    `Task: ${query}`,
    '',
    'Candidates:',
    candidates
  ].join('\n');
}

/**
 * Call an LLM API to rerank the top-3 candidates.
 * @param {Array<{name: string, score: number, description: string}>} top3
 * @param {string} query
 * @returns {Promise<{name: string, source: string}>}
 */
async function rerankWithLLM(top3, query) {
  if (!hasEnvConfig()) {
    logger.debug('LLM_RERANK_API_KEY not set, skipping LLM rerank');
    return { name: top3[0].name, source: 'fallback' };
  }
  if (!top3 || top3.length === 0) {
    return { name: null, source: 'fallback' };
  }

  const apiKey = process.env[RERANK_API_KEY_ENV];
  const model = process.env[RERANK_MODEL_ENV] || DEFAULT_MODEL;
  const endpoint = process.env[RERANK_ENDPOINT_ENV] || DEFAULT_ENDPOINT;

  const prompt = buildRerankPrompt(top3, query);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You select the best skill for a task. Reply with only the skill name.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 50
      })
    });

    if (!response.ok) {
      logger.warn(`LLM rerank API returned ${response.status}`);
      return { name: top3[0].name, source: 'fallback' };
    }

    const data = await response.json();
    const chosen = (data.choices?.[0]?.message?.content || '').trim().toLowerCase();

    const match = top3.find(s => s.name.toLowerCase() === chosen);
    if (match) {
      return { name: match.name, source: 'llm' };
    }
    return { name: top3[0].name, source: 'fallback' };
  } catch (err) {
    logger.warn(`LLM rerank error: ${err.message}`);
    return { name: top3[0].name, source: 'fallback' };
  }
}

/**
 * Plugin hook: allow the user to provide a custom reranker function.
 * @param {Function} [customReranker] — optional user-provided reranker(top3, query) => name
 * @returns {{ rerank: Function }}
 */
function createReranker(customReranker) {
  const rerank = customReranker || rerankWithLLM;
  return { rerank };
}

module.exports = { createReranker, rerankWithLLM, hasEnvConfig, buildRerankPrompt };

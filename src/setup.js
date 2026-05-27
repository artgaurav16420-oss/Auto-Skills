'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AGENTS_MD_HOOK = `## Global Session Start

ALWAYS invoke the \`auto-skill-select\` skill at the very start of every session (before any other action or clarifying question), AND re-invoke it before EVERY new task mid-session. Do not skip re-invocation — even if you remember the previous match. Task context changes; the skill match should too. The task layer loads one or more skills depending on score: single if >90, multi if 70-90.

You MUST follow Karpathy Guidelines (loaded via instructions) for every response: think before coding, simplicity first, surgical changes, goal-driven execution.
`;

const AGENTS_MD_CHECK = 'auto-skill-select';

/**
 * Check and setup AGENTS.md with auto-invoke hook.
 * @param {string} [agentsPath] — path to AGENTS.md (default: ~/.config/opencode/AGENTS.md)
 * @returns {{ status: string, path: string }}
 */
function setupAgentsMd(agentsPath) {
  const target = agentsPath || path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md');
  let content;
  try {
    content = fs.readFileSync(target, 'utf8');
  } catch {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, AGENTS_MD_HOOK, 'utf8');
    return { status: 'created', path: target };
  }

  if (content.includes(AGENTS_MD_CHECK)) {
    return { status: 'already-present', path: target };
  }

  fs.writeFileSync(target, content.trimEnd() + '\n\n' + AGENTS_MD_HOOK, 'utf8');
  return { status: 'appended', path: target };
}

module.exports = { setupAgentsMd, AGENTS_MD_HOOK, AGENTS_MD_CHECK };

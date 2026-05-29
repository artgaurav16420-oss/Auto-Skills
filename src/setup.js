'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AGENTS_MD_HOOK = `## Global Session Start

ALWAYS invoke the \`auto-skill-select\` skill at the very start of every session (before any other action or clarifying question), AND re-invoke it before EVERY new task mid-session. Do not skip re-invocation — even if you remember the previous match. Task context changes; the skill match should too. The task layer loads one or more skills depending on score: single if >90, multi if 70-90.

You MUST follow Karpathy Guidelines (loaded via instructions) for every response: think before coding, simplicity first, surgical changes, goal-driven execution.
`;

const AGENTS_MD_CHECK = 'auto-skill-select';

const OPENCODE_JSONC_SCHEMA = 'https://opencode.ai/config.json';
const RECOMMENDED_INSTRUCTIONS = [
  '~/.agents/skills/karpathy-guidelines/SKILL.md',
  '~/.agents/skills/caveman/SKILL.md',
  '~/.agents/skills/auto-skill-select/SKILL.md'
];
const RECOMMENDED_SKILL_PERMISSIONS = {
  'auto-skill-select': 'allow',
  'karpathy-guidelines': 'allow',
  'caveman': 'allow',
  '*': 'deny'
};

/**
 * Strip // line comments from a JSONC string.
 * @param {string} text
 * @returns {string}
 */
function stripJsoncComments(text) {
  return text.replace(/\/\/.*$/gm, '');
}

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

/**
 * Setup opencode.jsonc with recommended instructions and permission rules.
 * Merges with existing config — never removes user's settings.
 * @param {string} [configPath] — path to opencode.jsonc (default: ~/.config/opencode/opencode.jsonc)
 * @returns {{ status: string, path: string, message?: string }}
 */
function setupOpencodeJsonc(configPath) {
  const target = configPath || path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc');

  let existing = {};
  let fileExisted = true;
  try {
    let raw = fs.readFileSync(target, 'utf8');
    try {
      existing = JSON.parse(raw);
    } catch {
      const stripped = stripJsoncComments(raw);
      existing = JSON.parse(stripped);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      fileExisted = false;
    } else {
      return { status: 'error', path: target, message: `Cannot parse opencode.jsonc. Manual setup required: ${err.message}` };
    }
  }

  if (!existing.instructions) {
    existing.instructions = [];
  }
  for (const instr of RECOMMENDED_INSTRUCTIONS) {
    if (!existing.instructions.includes(instr)) {
      existing.instructions.push(instr);
    }
  }

  if (!existing.permission) {
    existing.permission = {};
  }
  if (!existing.permission.skill) {
    existing.permission.skill = {};
  }
  for (const [skillName, perm] of Object.entries(RECOMMENDED_SKILL_PERMISSIONS)) {
    if (!(skillName in existing.permission.skill)) {
      existing.permission.skill[skillName] = perm;
    }
  }

  if (!existing['$schema']) {
    existing['$schema'] = OPENCODE_JSONC_SCHEMA;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(existing, null, 2) + '\n', 'utf8');

  return { status: fileExisted ? 'updated' : 'created', path: target };
}

module.exports = { setupAgentsMd, setupOpencodeJsonc, AGENTS_MD_HOOK, AGENTS_MD_CHECK, OPENCODE_JSONC_SCHEMA, RECOMMENDED_INSTRUCTIONS, RECOMMENDED_SKILL_PERMISSIONS };

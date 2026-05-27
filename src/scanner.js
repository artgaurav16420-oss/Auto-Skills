'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { logger } = require('./logger');

const SECURE_BASE_DIR = fs.realpathSync(path.resolve(process.cwd()));

function isValidSkillsArray(data) {
  return Array.isArray(data) && data.every(s => s && s.name && typeof s.description === 'string');
}

function extractSkillsFromData(data) {
  if (isValidSkillsArray(data)) return data;
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.skills)) {
    if (isValidSkillsArray(data.skills)) return data.skills;
  }
  return null;
}

function isPathAllowed(targetPath) {
  const resolved = fs.realpathSync(targetPath);
  const relative = path.relative(SECURE_BASE_DIR, resolved);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Load skills from custom path, SKILLS_JSON env var, or return empty array.
 * @param {string} [customPath] — optional path to JSON file with skills array
 * @returns {Array<{name: string, description: string}>}
 */
function loadSkills(customPath) {
  if (customPath) {
    try {
      if (typeof customPath !== 'string') {
        logger.warn('loadSkills: customPath must be a string');
        return [];
      }
      const resolvedPath = path.resolve(customPath);
      if (!isPathAllowed(resolvedPath)) {
        logger.warn(`loadSkills: path traversal blocked for ${customPath}`);
        return [];
      }
      const data = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
      const extracted = extractSkillsFromData(data);
      if (extracted) return extracted;
      logger.warn(`loadSkills: invalid skills array in ${customPath}`);
      return [];
    } catch (err) {
      logger.warn(`loadSkills: error reading ${customPath} — ${err.message}`);
      return [];
    }
  }

  const envJson = process.env.SKILLS_JSON;
  if (envJson) {
    try {
      const data = JSON.parse(envJson);
      if (isValidSkillsArray(data)) {
        return data;
      }
      logger.warn('loadSkills: SKILLS_JSON does not contain a valid skills array');
    } catch (err) {
      logger.warn(`loadSkills: SKILLS_JSON parse error — ${err.message}`);
    }
    return [];
  }

  return [];
}

/**
 * Parse YAML frontmatter from a SKILL.md file.
 * @param {string} content — raw file content
 * @returns {{ name: string, description: string } | null}
 */
function parseSkillFrontmatter(content) {
  if (!content || typeof content !== 'string') return null;
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const yaml = match[1];
  const name = yaml.match(/^name:\s*(.+)$/m);
  const description = yaml.match(/^description:\s*(.+)$/m);
  if (!name || !description) return null;
  return { name: name[1].trim(), description: description[1].trim() };
}

/**
 * Walk a directory tree looking for a specific target filename.
 * Uses safe fallback logging instead of silently swallowing errors.
 * @param {string} root — directory to start walking from
 * @param {string} target — filename to search for
 * @returns {string[]} array of paths to found target files
 */
function walkForSubdir(root, target) {
  const results = [];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(root, e.name);
      const candidate = path.join(full, target);
      if (fs.existsSync(candidate)) {
        results.push(candidate);
      } else {
        results.push(...walkForSubdir(full, target));
      }
    }
  } catch (err) {
    logger.debug(`walkForSubdir: permission error reading ${root} — ${err.message}`);
  }
  return results;
}

function getDefaultScanDirs() {
  const dirs = [
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.config', 'opencode', 'skills'),
    path.join(os.homedir(), '.claude', 'skills')
  ];
  const userAgentsSkills = path.join(os.homedir(), '.agents', 'skills');
  const eccSkills = path.join(userAgentsSkills, 'ecc', 'skills');
  if (fs.existsSync(eccSkills)) dirs.push(eccSkills);
  const cacheBase = path.join(os.homedir(), '.cache', 'opencode', 'packages');
  try {
    const found = walkForSubdir(cacheBase, path.join('node_modules', 'superpowers', 'skills'));
    dirs.push(...found);
  } catch {
    // root directory may not exist
  }
  return dirs;
}

function scanDirForSkills(dir, seen, collector) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(dir, entry.name, 'SKILL.md');
    let content;
    try {
      content = fs.readFileSync(skillPath, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseSkillFrontmatter(content);
    if (parsed && !seen.has(parsed.name)) {
      seen.add(parsed.name);
      collector.push(parsed);
    }
  }
}

/**
 * Discover skills by scanning directories for SKILL.md files.
 * @param {string[]} [dirs] — directories to scan (default: common skill locations)
 * @returns {Array<{name: string, description: string}>}
 */
function discoverSkills(dirs) {
  const searchDirs = Array.isArray(dirs) && dirs.length > 0 ? dirs : getDefaultScanDirs();
  const seen = new Set();
  const skills = [];

  for (const dir of searchDirs) {
    scanDirForSkills(dir, seen, skills);
  }
  return skills;
}

/**
 * Detect project language, framework, and libraries from project files.
 * @param {string} [projectDir] — project root to analyze (default: cwd)
 * @returns {{ language: string|null, framework: string|null, libraries: string[], testingTools: string[] }}
 */
function detectProjectContext(projectDir) {
  const ctx = { language: null, framework: null, libraries: [], testingTools: [] };
  const dir = projectDir || process.cwd();

  // package.json (Node.js)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    ctx.language = 'node';
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depNames = Object.keys(allDeps);

    if (depNames.includes('next')) ctx.framework = 'next';
    else if (depNames.includes('react')) ctx.framework = 'react';
    else if (depNames.includes('vue')) ctx.framework = 'vue';
    else if (depNames.includes('nuxt')) ctx.framework = 'nuxt';
    else if (depNames.includes('svelte')) ctx.framework = 'svelte';
    else if (depNames.includes('@nestjs/core')) ctx.framework = 'nest';
    else if (depNames.includes('express')) ctx.framework = 'express';
    else if (depNames.includes('fastify')) ctx.framework = 'fastify';
    else if (depNames.includes('angular')) ctx.framework = 'angular';

    for (const lib of ['prisma','supabase','stripe','tailwindcss','trpc','graphql','zustand','redux','playwright','cypress']) {
      if (depNames.includes(lib)) ctx.libraries.push(lib);
    }
    for (const t of ['jest','vitest','mocha','cypress','playwright']) {
      if (depNames.includes(t)) ctx.testingTools.push(t);
    }
    return ctx;
  } catch {}

  // pyproject.toml (Python)
  try {
    const content = fs.readFileSync(path.join(dir, 'pyproject.toml'), 'utf8');
    ctx.language = 'python';
    if (content.includes('django')) ctx.framework = 'django';
    else if (content.includes('fastapi')) ctx.framework = 'fastapi';
    else if (content.includes('flask')) ctx.framework = 'flask';
    for (const lib of ['sqlalchemy','alembic','celery','redis','pytest']) {
      if (content.includes(lib)) ctx.libraries.push(lib);
    }
    if (content.includes('pytest')) ctx.testingTools.push('pytest');
    return ctx;
  } catch {}

  // Cargo.toml (Rust)
  try {
    const content = fs.readFileSync(path.join(dir, 'Cargo.toml'), 'utf8');
    ctx.language = 'rust';
    if (content.includes('axum')) ctx.framework = 'axum';
    else if (content.includes('actix-web')) ctx.framework = 'actix-web';
    else if (content.includes('rocket')) ctx.framework = 'rocket';
    for (const lib of ['diesel','sqlx','tokio','serde']) {
      if (content.includes(lib)) ctx.libraries.push(lib);
    }
    return ctx;
  } catch {}

  // go.mod (Go)
  try {
    const content = fs.readFileSync(path.join(dir, 'go.mod'), 'utf8');
    ctx.language = 'go';
    if (content.includes('gin')) ctx.framework = 'gin';
    else if (content.includes('echo')) ctx.framework = 'echo';
    else if (content.includes('fiber')) ctx.framework = 'fiber';
    return ctx;
  } catch {}

  return ctx;
}

/**
 * Scan skill directories and write a lightweight skills index with paths.
 * @param {string} [outputPath] — path for .skills-index.json (default: cwd/.skills-index.json)
 * @param {string[]} [scanDirs] — directories to scan (default: common skill locations)
 * @param {object} [projectContext] — optional project context to embed in the index
 * @returns {Array<{name: string, description: string, path: string}>}
 */
function buildSkillIndex(outputPath, scanDirs, projectContext) {
  const searchDirs = Array.isArray(scanDirs) && scanDirs.length > 0 ? scanDirs : getDefaultScanDirs();
  const seen = new Set();
  const index = [];

  for (const dir of searchDirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(dir, entry.name, 'SKILL.md');
      let content;
      try {
        content = fs.readFileSync(skillPath, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseSkillFrontmatter(content);
      if (parsed && !seen.has(parsed.name)) {
        seen.add(parsed.name);
        index.push({ name: parsed.name, description: parsed.description, path: skillPath });
      }
    }
  }

  const out = outputPath || path.join(process.cwd(), '.skills-index.json');
  const output = projectContext
    ? { project: projectContext, skills: index }
    : index;
  fs.writeFileSync(out, JSON.stringify(output, null, 2), 'utf8');
  return output;
}

module.exports = {
  isValidSkillsArray, extractSkillsFromData, isPathAllowed,
  loadSkills, parseSkillFrontmatter, walkForSubdir,
  getDefaultScanDirs, scanDirForSkills, discoverSkills,
  detectProjectContext, buildSkillIndex
};

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd,
  clearCache
} = require('../src/index');

function printScore(taskText, customPath) {
  const skills = loadSkills(customPath);
  if (skills.length === 0) {
    console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
    return false;
  }
  const results = score(skills, taskText);
  console.log(JSON.stringify(results, null, 2));
  return true;
}

function scanAndScore(taskText, scanDirs) {
  const skills = discoverSkills(scanDirs);
  if (skills.length === 0) {
    console.log('No skills discovered in any skill directory.');
    return false;
  }
  const results = score(skills, taskText);
  if (results.length === 0) {
    console.log('No skills matched.');
    return false;
  }
  console.log(`Scanned ${skills.length} skills. Best match: ${results[0].name} (${results[0].score}/100)`);
  console.log(JSON.stringify(results, null, 2));
  return true;
}

function printMultiScore(taskText, customPath, threshold) {
  const skills = loadSkills(customPath);
  if (skills.length === 0) {
    console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
    return false;
  }
  const results = score(skills, taskText);
  const filtered = results.filter(r => r.score >= threshold);
  if (filtered.length === 0) {
    console.log(JSON.stringify({ threshold, count: 0, message: `No skills scored >= ${threshold}`, results }, null, 2));
    return true;
  }
  console.log(JSON.stringify({ threshold, count: filtered.length, results: filtered }, null, 2));
  return true;
}

function validateSkill(skillPath) {
  const issues = [];
  try {
    const resolvedPath = path.resolve(skillPath);
    if (!fs.existsSync(resolvedPath)) {
      issues.push(`Path does not exist: ${skillPath}`);
      return { valid: false, issues };
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      issues.push(`Not a file: ${skillPath}`);
    }
    if (!resolvedPath.endsWith('SKILL.md')) {
      issues.push('File should be named SKILL.md');
    }
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = parseSkillFrontmatter(content);
    if (!parsed) {
      issues.push('Invalid or missing YAML frontmatter (must start with --- and contain name + description)');
    } else {
      if (!parsed.name || parsed.name.trim().length === 0) {
        issues.push('Missing required field: name');
      }
      if (!parsed.description || parsed.description.trim().length === 0) {
        issues.push('Missing required field: description');
      }
    }
    try {
      fs.realpathSync(resolvedPath);
    } catch (e) {
      issues.push(`Path resolution issue: ${e.message}`);
    }
    return { valid: issues.length === 0, issues };
  } catch (err) {
    issues.push(`Unexpected error: ${err.message}`);
    return { valid: false, issues };
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('error', () => {
      rl.close();
      process.exit(1);
    });
    rl.question('Describe the task: ', input => {
      if (!input || !input.trim()) {
        console.log('No task entered. Exiting.');
        rl.close();
        return;
      }
      printScore(input.trim());
      rl.close();
    });
    return;
  }

  if (args[0] === '--validate' || args[0] === '-v') {
    const skillPath = args[1];
    if (!skillPath) {
      console.log(JSON.stringify({ error: 'Skill path required after --validate' }));
      return;
    }
    const result = validateSkill(skillPath);
    if (result.valid) {
      console.log(JSON.stringify({ valid: true, message: 'Skill is valid' }));
    } else {
      console.log(JSON.stringify({ valid: false, issues: result.issues }));
    }
    return;
  }

  if (args[0] === '--multi' || args[0] === '-m') {
    const thresholdIdx = args.indexOf('--threshold') !== -1 ? args.indexOf('--threshold') : args.indexOf('-t');
    const threshold = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : 70;
    const nonFlagArgs = args.filter((a, i) => {
      if (a === '--multi' || a === '-m') return false;
      if (a === '--threshold' || a === '-t') return false;
      if (thresholdIdx !== -1 && (i === thresholdIdx + 1)) return false;
      return true;
    });
    const taskText = nonFlagArgs[0];
    const indexPath = nonFlagArgs[1];
    if (!taskText) {
      console.log(JSON.stringify({ error: 'Task text required after --multi' }));
      return;
    }
    printMultiScore(taskText, indexPath, threshold);
    return;
  }

  if (args[0] === '--scan' || args[0] === '-s') {
    const taskText = args[1];
    const scanDirs = args[2] ? [args[2]] : undefined;
    if (!taskText) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl.on('error', () => {
        rl.close();
        process.exit(1);
      });
      rl.question('Describe the task: ', input => {
        if (!input || !input.trim()) {
          console.log('No task entered. Exiting.');
          rl.close();
          return;
        }
        scanAndScore(input.trim(), scanDirs);
        rl.close();
      });
      return;
    }
    scanAndScore(taskText, scanDirs);
    return;
  }

  if (args[0] === '--index' || args[0] === '-i') {
    const outputPath = args[1] ? path.resolve(args[1]) : undefined;
    const scanDirs = args[2] ? [args[2]] : undefined;
    const count = buildSkillIndex(outputPath, scanDirs).length;
    console.log(`Indexed ${count} skills → ${outputPath || path.join(process.cwd(), '.skills-index.json')}`);
    return;
  }

  if (args[0] === '--setup') {
    const result = setupAgentsMd(args[1] ? path.resolve(args[1]) : undefined);
    if (result.status === 'already-present') {
      console.log(`\u2713 auto-skill-select hook already present in ${result.path}`);
    } else if (result.status === 'created') {
      console.log(`\u2713 Created ${result.path} with auto-skill-select hook`);
    } else {
      console.log(`\u2713 Appended auto-skill-select hook to ${result.path}`);
    }
    return;
  }

  if (args[0] === '--enrich' || args[0] === '-e') {
    const projectDir = args[1] ? path.resolve(args[1]) : undefined;
    const outputPath = args[2] ? path.resolve(args[2]) : undefined;
    const scanDirs = args[3] ? [args[3]] : undefined;
    const ctx = detectProjectContext(projectDir);
    const output = buildSkillIndex(outputPath, scanDirs, ctx);
    const count = output.skills.length;
    console.log(`Indexed ${count} skills with project context → ${outputPath || path.join(process.cwd(), '.skills-index.json')}`);
    if (ctx.language) console.log(`  ${ctx.language}${ctx.framework ? '/' + ctx.framework : ''}${ctx.libraries.length > 0 ? ' [' + ctx.libraries.join(', ') + ']' : ''}`);
    return;
  }

  if (args[0] === '--catalog') {
    const knownSkillsPath = path.join(__dirname, '..', 'data', 'known-skills.json');
    try {
      const catalog = JSON.parse(fs.readFileSync(knownSkillsPath, 'utf8'));
      console.log(JSON.stringify(catalog, null, 2));
    } catch {
      console.log(JSON.stringify({ error: 'known-skills.json not found' }));
    }
    return;
  }

  printScore(args[0], args[1]);
}

if (require.main === module) main();
module.exports = {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd,
  clearCache
};

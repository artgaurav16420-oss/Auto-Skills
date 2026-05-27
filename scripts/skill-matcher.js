#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd,
  clearCache, resetSynonyms, loadSynonyms
} = require('../src/index');


function printScore(taskText, customPath, useSemantic) {
  const skills = loadSkills(customPath);
  if (skills.length === 0) {
    console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
    return false;
  }
  const computeSemantic = useSemantic ? require('../src/index').computeSemanticScore : undefined;
  score(skills, taskText, { useSemantic, computeSemantic }).then(results => {
    console.log(JSON.stringify(results, null, 2));
    return true;
  }).catch(err => {
    console.log(JSON.stringify({ error: err.message }));
    return false;
  });
}

function scanAndScore(taskText, scanDirs) {
  const skills = discoverSkills(scanDirs);
  if (skills.length === 0) {
    console.log('No skills discovered in any skill directory.');
    return false;
  }
  score(skills, taskText).then(results => {
    if (results.length === 0) {
      console.log('No skills matched.');
      return false;
    }
    console.log(`Scanned ${skills.length} skills. Best match: ${results[0].name} (${results[0].score}/100)`);
    console.log(JSON.stringify(results, null, 2));
    return true;
  }).catch(err => {
    console.log(JSON.stringify({ error: err.message }));
  });
}

function printMultiScore(taskText, customPath, threshold) {
  const skills = loadSkills(customPath);
  if (skills.length === 0) {
    console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
    return false;
  }
  score(skills, taskText).then(results => {
    const filtered = results.filter(r => r.score >= threshold);
    if (filtered.length === 0) {
      console.log(JSON.stringify({ threshold, count: 0, message: `No skills scored >= ${threshold}`, results }, null, 2));
      return true;
    }
    console.log(JSON.stringify({ threshold, count: filtered.length, results: filtered }, null, 2));
    return true;
  }).catch(err => {
    console.log(JSON.stringify({ error: err.message }));
  });
}

function loadCatalog() {
  const CATALOG_PATH = path.join(__dirname, '..', 'data', 'known-skills.json');
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    return [];
  }
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

async function main() {
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

  if (args[0] === '--semantic' || args[0] === '-S') {
    const taskText = args[1];
    const customPath = args[2];
    if (!taskText) {
      console.log(JSON.stringify({ error: 'Task text required after --semantic' }));
      return;
    }
    const skills = loadSkills(customPath);
    if (skills.length === 0) {
      console.log('No skills loaded. Provide SKILLS_JSON env var or pass a JSON file path as second argument.');
      return;
    }
    const { computeSemanticScore: cs } = require('../src/index');
    const results = await score(skills, taskText, { useSemantic: true, computeSemantic: cs });
    console.log(JSON.stringify(results, null, 2));
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
    buildSkillIndex(outputPath, scanDirs).then(output => {
      const count = Array.isArray(output) ? output.length : output.skills.length;
      console.log(`Indexed ${count} skills \u2192 ${outputPath || path.join(process.cwd(), '.skills-index.json')}`);
    }).catch(err => {
      console.log(`Index error: ${err.message}`);
    });
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
    buildSkillIndex(outputPath, scanDirs, ctx).then(output => {
      const count = output.skills.length;
      console.log(`Indexed ${count} skills with project context \u2192 ${outputPath || path.join(process.cwd(), '.skills-index.json')}`);
      if (ctx.language) console.log(`  ${ctx.language}${ctx.framework ? '/' + ctx.framework : ''}${ctx.libraries.length > 0 ? ' [' + ctx.libraries.join(', ') + ']' : ''}`);
    }).catch(err => {
      console.log(`Enrich error: ${err.message}`);
    });
    return;
  }

  if (args[0] === '--catalog' || args[0] === '-c') {
    const catalog = loadCatalog();
    if (catalog.length === 0) {
      console.log('Catalog not found or empty.');
      return;
    }
    console.log(JSON.stringify(catalog, null, 2));
    return;
  }

  printScore(args[0], args[1]);
}

if (require.main === module) main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
module.exports = {
  score, tokenize, loadSkills, extractIntent, parseSkillFrontmatter,
  discoverSkills, buildSkillIndex, detectProjectContext, setupAgentsMd,
  clearCache, resetSynonyms, loadSynonyms, loadCatalog
};

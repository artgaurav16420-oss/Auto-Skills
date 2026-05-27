'use strict';

const path = require('path');
const fs = require('fs');

const {
  score, clearCache
} = require('../scripts/skill-matcher');

const TASKS_FILE = path.join(__dirname, 'tasks.json');
const SKILLS_DIR = path.join(__dirname, '..', 'data', 'benchmark-skills');

const STATS_ROWS = ['total', 'passed', 'failed', 'errors'];
const SCORE_BANDS = ['90-100', '70-89', '40-69', '0-39'];

function loadBenchmarkSkills() {
  if (fs.existsSync(SKILLS_DIR)) {
    const { discoverSkills } = require('../scripts/skill-matcher');
    return discoverSkills([SKILLS_DIR]);
  }
  return [
    { name: 'react-debug', description: 'Debug and fix React component issues, state bugs, and rendering problems in frontend applications' },
    { name: 'css-layout', description: 'Fix CSS layout, responsive design, Tailwind styling, and cross-browser compatibility issues' },
    { name: 'db-migration', description: 'Migrate database schemas, write SQL migrations, handle data backfills and rollbacks' },
    { name: 'express-auth', description: 'Implement authentication middleware, JWT handling, OAuth flows, and session management in Express apps' },
    { name: 'image-optimization', description: 'Optimize images for web, implement lazy loading, responsive images, and CDN integration' },
    { name: 'e2e-testing', description: 'End-to-end testing with Playwright or Cypress for web application user flows' },
    { name: 'vercel-deploy', description: 'Deploy Next.js applications to Vercel with environment configuration and preview deployments' },
    { name: 'api-design', description: 'Design REST APIs with proper resource naming, pagination, error handling, and versioning' },
    { name: 'websocket-patterns', description: 'Implement WebSocket connections, real-time messaging, reconnection logic, and event handling' },
    { name: 'type-migration', description: 'Migrate JavaScript codebase to TypeScript with proper types, interfaces, and strict mode' },
    { name: 'docker-compose', description: 'Setup Docker Compose for local development with multi-service orchestration and volumes' },
    { name: 'ci-pipeline', description: 'Configure CI/CD pipelines with GitHub Actions for automated testing and deployment' },
    { name: 'dark-mode', description: 'Implement dark mode with CSS variables, localStorage persistence, and system preference detection' },
    { name: 'sql-optimization', description: 'Optimize SQL queries, add indexes, analyze query plans, and improve database performance' },
    { name: 'vue-component', description: 'Build Vue 3 components with Composition API, props, slots, and reactive state management' },
    { name: 'prisma-schema', description: 'Design Prisma ORM schemas with relations, enums, indexes, and migration strategies' },
    { name: 'go-middleware', description: 'Create Go HTTP middleware for logging, authentication, rate limiting, and request validation' },
    { name: 'unit-testing', description: 'Write unit tests with Jest or Vitest covering edge cases, mocks, and assertions' },
    { name: 'performance-optimization', description: 'Optimize frontend performance with code splitting, lazy loading, and bundle analysis' },
    { name: 'angular-modules', description: 'Refactor Angular applications between NgModules and standalone component architecture' },
    { name: 'search-ui', description: 'Build search interfaces with debounced input, autocomplete, and result highlighting' },
    { name: 'state-management', description: 'Manage application state with React Context, Zustand, Redux, or Vuex/Pinia stores' },
    { name: 'eslint-config', description: 'Configure ESLint with plugins, custom rules, and Prettier integration for code quality' },
    { name: 'oauth-flow', description: 'Implement OAuth2 authentication flow with PKCE, token refresh, and secure storage' },
    { name: 'pagination', description: 'Implement cursor-based and offset-based pagination for REST APIs and database queries' },
    { name: 'cli-tool', description: 'Build CLI tools with argument parsing, colored output, progress bars, and config files' },
    { name: 'error-tracking', description: 'Integrate error tracking with Sentry including source maps, breadcrumbs, and user context' },
    { name: 'playwright-e2e', description: 'Write Playwright E2E tests with page objects, fixtures, and CI pipeline integration' },
    { name: 'redis-caching', description: 'Cache API responses with Redis including invalidation strategies and TTL management' },
    { name: 'microservices', description: 'Refactor monolith to microservices with message queues, API gateway, and service discovery' },
    { name: 'webpack-optimization', description: 'Optimize Webpack configuration with code splitting, loaders, and production tuning' },
    { name: 'react-hooks', description: 'Create custom React hooks for reusable logic including lifecycle, debounce, and media queries' },
    { name: 'tailwind-theming', description: 'Configure Tailwind CSS with custom theme, brand colors, typography plugin, and dark variant' },
    { name: 'mongodb-optimization', description: 'Optimize MongoDB queries with indexes, aggregation pipelines, and schema design' },
    { name: 'realtime-notifications', description: 'Implement real-time notifications using WebSockets or Server-Sent Events' },
    { name: 'graphql-api', description: 'Design GraphQL schemas with resolvers, mutations, subscriptions, and dataloader patterns' },
    { name: 'rate-limiting', description: 'Implement API rate limiting with token bucket, sliding window, and distributed counters' },
    { name: 'stripe-integration', description: 'Integrate Stripe payments with webhook handling, idempotency, and error recovery' },
    { name: 'docker-caching', description: 'Optimize Docker builds with layer caching, multi-stage builds, and .dockerignore' },
    { name: 'a11y-components', description: 'Build accessible UI components with ARIA attributes, keyboard navigation, and screen readers' },
    { name: 'mobile-touch', description: 'Fix mobile touch interactions, eliminate 300ms tap delay, and implement gesture handling' },
    { name: 'supabase-realtime', description: 'Setup Supabase real-time subscriptions, row-level security, and database triggers' },
    { name: 'etl-pipeline', description: 'Build ETL pipelines for data processing with parallel execution and error recovery' },
    { name: 'jest-optimization', description: 'Optimize Jest test performance with worker pool config, module caching, and test isolation' },
    { name: 'feature-flags', description: 'Implement feature flags with LaunchDarkly or custom toggle system for gradual rollout' },
    { name: 'storybook-docs', description: 'Create component documentation with Storybook including stories, MDX, and addons' },
    { name: 'openapi-spec', description: 'Write OpenAPI 3.0 specifications with examples, schemas, and security definitions' },
    { name: 'github-actions', description: 'Create GitHub Actions workflows for auto-labeling, linting, and release management' },
    { name: 'load-testing', description: 'Setup K6 load testing scripts with scenarios, thresholds, and metrics analysis' },
    { name: 'zustand-state', description: 'Manage global UI state with Zustand including persist middleware and devtools' }
  ];
}

/**
 * Run the benchmark: score all tasks against all skills, collect stats.
 */
async function runBenchmark() {
  console.log('Auto-Skills Benchmark');
  console.log('====================\n');

  const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  const skills = loadBenchmarkSkills();

  console.log(`Tasks: ${tasks.length}`);
  console.log(`Skills: ${skills.length}`);
  console.log('');

  const results = {
    perTask: [],
    byBand: Object.fromEntries(SCORE_BANDS.map(b => [b, 0])),
    stats: Object.fromEntries(STATS_ROWS.map(r => [r, 0]))
  };

  for (const task of tasks) {
    clearCache();
    try {
      const ranked = await score(skills, task);
      const top = ranked[0] || { name: '(none)', score: 0 };
      const band = bandFor(top.score);
      results.byBand[band]++;
      results.perTask.push({ task: task.slice(0, 60), best: top.name, score: top.score, band });
      results.stats.passed++;
    } catch (err) {
      results.stats.errors++;
      results.perTask.push({ task: task.slice(0, 60), best: '(error)', score: 0, band: '0-39', error: err.message });
    }
    results.stats.total++;
  }

  printResults(results, tasks.length);
}

function bandFor(score) {
  if (score >= 90) return '90-100';
  if (score >= 70) return '70-89';
  if (score >= 40) return '40-69';
  return '0-39';
}

function printResults(results, totalTasks) {
  console.log('Score Distribution:');
  for (const band of SCORE_BANDS) {
    const count = results.byBand[band];
    const pct = ((count / totalTasks) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / totalTasks * 50));
    console.log(`  ${band}: ${String(count).padStart(3)} (${pct}%) ${bar}`);
  }

  console.log('\nTop Matches per Task:');
  for (const r of results.perTask) {
    const scoreStr = String(r.score).padStart(3);
    const bandStr = r.band.padEnd(5);
    const taskStr = r.task.padEnd(62);
    console.log(`  ${scoreStr} [${bandStr}] ${taskStr} → ${r.best}`);
    if (r.error) {
      console.log(`       ⚠ ${r.error}`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Total:  ${results.stats.total}`);
  console.log(`  Errors: ${results.stats.errors}`);
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

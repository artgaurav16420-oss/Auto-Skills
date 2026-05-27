'use strict';

const DEBUG_ENV_VAR = 'DEBUG';

function isDebugEnabled() {
  return process.env[DEBUG_ENV_VAR] === 'true' || process.env[DEBUG_ENV_VAR] === '1';
}

function log(level, message, ...args) {
  const prefix = `[auto-skills:${level}]`;
  if (level === 'debug' && !isDebugEnabled()) return;
  if (level === 'warn') {
    console.warn(prefix, message, ...args);
  } else if (level === 'error') {
    console.error(prefix, message, ...args);
  } else {
    console.log(prefix, message, ...args);
  }
}

const logger = {
  debug: (msg, ...args) => log('debug', msg, ...args),
  info: (msg, ...args) => log('info', msg, ...args),
  warn: (msg, ...args) => log('warn', msg, ...args),
  error: (msg, ...args) => log('error', msg, ...args),
};

module.exports = { logger, isDebugEnabled };

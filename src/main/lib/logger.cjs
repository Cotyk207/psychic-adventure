'use strict';

const fs = require('fs');
const path = require('path');
const { get } = require('./paths.cjs');

let logFile = null;
let stream = null;

function init() {
  try {
    const dirs = get();
    logFile = path.join(dirs.logs, 'app.log');
    stream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch {
    stream = null;
  }
}

function write(level, args) {
  const line = `[${new Date().toISOString()}] [${level}] ${args
    .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
    .join(' ')}\n`;
  try {
    stream?.write(line);
  } catch {}
  if (level === 'error') console.error(line.trim());
  else console.log(line.trim());
}

module.exports = {
  init,
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
  debug: (...a) => write('DEBUG', a),
};

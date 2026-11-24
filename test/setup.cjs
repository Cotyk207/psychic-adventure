'use strict';

/**
 * Подменяет `require('electron')` заглушкой и выставляет временный HOME.
 * Подключается первым в каждом тестовом файле.
 */

const Module = require('module');
const path = require('path');
const fs = require('fs');

const stubPath = path.resolve(__dirname, 'stubs', 'electron.cjs');

if (!process.env.PSYCHIC_TEST_HOME) {
  process.env.PSYCHIC_TEST_HOME = fs.mkdtempSync(path.join(require('os').tmpdir(), 'psychic-test-'));
}

const electronStub = require(stubPath);
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

module.exports = { stub: electronStub };

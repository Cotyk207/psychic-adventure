'use strict';

/**
 * Дочерний процесс: поднимает настоящий main-процесс PSYCHIC на заглушке Electron
 * и печатает список зарегистрированных IPC-каналов. Родитель проверяет, что
 * приложение реально поднялось (все require-цепочки, initServices, registerIpc).
 */

require('./setup.cjs');

const electron = require('electron');

process.on('uncaughtException', (err) => {
  process.stderr.write(`UNCAUGHT: ${err && err.stack}\n`);
  process.exit(3);
});
process.on('unhandledRejection', (err) => {
  process.stderr.write(`UNHANDLED: ${err && err.stack}\n`);
  process.exit(4);
});

try {
  require('../src/main/index.cjs');
} catch (err) {
  process.stderr.write(`BOOT ERROR: ${err && err.stack}\n`);
  process.exit(2);
}

// Даём асинхронной загрузке (initServices, registerIpc) завершиться.
setTimeout(() => {
process.stdout.write(JSON.stringify({
  channels: [...electron.ipcMain.handlers.keys()].sort(),
  windows: electron.BrowserWindow.getAllWindows().length,
}) + '\n');
  process.exit(0);
}, 1500);

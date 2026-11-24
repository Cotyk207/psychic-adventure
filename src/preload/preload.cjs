'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, callback) => {
    if (typeof callback !== 'function') throw new Error('callback must be a function');
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  isElectron: true,
};

contextBridge.exposeInMainWorld('psychic', api);

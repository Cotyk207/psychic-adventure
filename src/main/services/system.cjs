'use strict';

/**
 * Системная телеметрия для «Обзора»: CPU, память, диски, сеть.
 * Электрон-специфика изолирована в collect(), чистые части легко тестировать.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

function cpuTimesSnapshot() {
  const cpus = os.cpus();
  if (!cpus || !cpus.length) return null;
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const { user, nice, sys, idle: idleTime, irq } = cpu.times || {};
    idle += idleTime || 0;
    total += (user || 0) + (nice || 0) + (sys || 0) + (idleTime || 0) + (irq || 0);
  }
  return { idle, total };
}

/** Загрузка CPU как среднее по окну между двумя снапшотами. */
function cpuPercentBetween(prev, next) {
  if (!prev || !next) return 0;
  const idle = next.idle - prev.idle;
  const total = next.total - prev.total;
  if (total <= 0) return 0;
  const used = total - idle;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

async function measureCpu(windowMs = 350) {
  const first = cpuTimesSnapshot();
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const second = cpuTimesSnapshot();
  const cpus = os.cpus() || [];
  return {
    percent: cpuPercentBetween(first, second),
    cores: cpus.length || 1,
    model: cpus[0]?.model?.trim() || 'Unknown CPU',
    speed: cpus[0]?.speed || 0,
    loadAvg: os.loadavg ? os.loadavg().map((n) => Math.round(n * 100) / 100) : [0, 0, 0],
  };
}

function memoryStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total,
    free,
    used,
    percent: total ? Math.round((used / total) * 100) : 0,
  };
}

function listDriveRoots(platform = process.platform) {
  if (platform === 'win32') {
    // Типичные буквы дисков; несуществующие отсеются в diskUsage().
    return 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}:\\`);
  }
  return ['/'];
}

function diskUsage(root) {
  try {
    const st = fs.statfsSync(root);
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    const used = total - free;
    return {
      path: root,
      total,
      free,
      used,
      percent: total ? Math.round((used / total) * 100) : 0,
    };
  } catch {
    return null;
  }
}

function disksStats(platform = process.platform) {
  const out = [];
  for (const root of listDriveRoots(platform)) {
    const usage = diskUsage(root);
    if (usage && usage.total > 0) out.push(usage);
    if (out.length >= 4) break;
  }
  return out;
}

function networkStats() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const item of list || []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      out.push({ name, address: item.address, mac: item.mac, family: item.family });
    }
  }
  return out;
}

function uptimeText(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

/**
 * Полный снимок системы. `extra` позволяет подмешать платформо-зависимые данные
 * (например, версию приложения) и упрощает тестирование.
 */
async function collect({ extra = {}, windowMs = 350 } = {}) {
  const cpu = await measureCpu(windowMs);
  const memory = memoryStats();
  const disks = disksStats(process.platform);
  return {
    cpu,
    memory,
    disks,
    network: networkStats(),
    uptime: os.uptime(),
    uptimeText: uptimeText(os.uptime()),
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    hostname: os.hostname(),
    node: process.versions.node,
    ...extra,
  };
}

module.exports = {
  collect,
  cpuTimesSnapshot,
  cpuPercentBetween,
  memoryStats,
  disksStats,
  diskUsage,
  networkStats,
  uptimeText,
  listDriveRoots,
};

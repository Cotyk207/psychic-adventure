import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseSkillMd(md) {
  const match = String(md).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: String(md) };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: match[2] };
}

function loadBuiltinSkills() {
  const dir = path.join(ROOT, 'resources', 'skills');
  if (!fs.existsSync(dir)) return [];
  const skills = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dir, entry.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const { meta, body } = parseSkillMd(fs.readFileSync(file, 'utf8'));
    const id = meta.id || entry.name;
    skills.push({
      id,
      name: meta.name || id,
      description: meta.description || '',
      whenToUse: meta.when_to_use || meta.when || '',
      color: meta.color || '#00f0ff',
      icon: meta.icon || 'sparkles',
      tools: Array.isArray(meta.tools) ? meta.tools : [],
      body: body.trim(),
      source: 'builtin',
      builtin: true,
      path: `/skills/${id}/SKILL.md`,
    });
  }
  return skills;
}

export function psychicAssetsPlugin() {
  const virtualId = 'virtual:psychic-bundled';
  const resolvedId = '\0' + virtualId;

  return {
    name: 'psychic-assets',
    resolveId(id) {
      if (id === virtualId) return resolvedId;
      return null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const skills = loadBuiltinSkills();
      return [
        `export const APP_VERSION = ${JSON.stringify(pkg.version || '1.0.7')};`,
        `export const BUILTIN_SKILLS = ${JSON.stringify(skills)};`,
      ].join('\n');
    },
  };
}

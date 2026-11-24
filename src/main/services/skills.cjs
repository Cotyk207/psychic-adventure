'use strict';

const fs = require('fs');
const path = require('path');
const { get, resourcesPath } = require('../lib/paths');
const { uid, slugify, truncate } = require('../lib/util');

function parseFrontmatter(md) {
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

function buildFrontmatter(skill) {
  const lines = ['---'];
  lines.push(`name: ${JSON.stringify(skill.name || 'Skill')}`);
  lines.push(`description: ${JSON.stringify(skill.description || '')}`);
  if (skill.whenToUse) lines.push(`when_to_use: ${JSON.stringify(skill.whenToUse)}`);
  if (skill.color) lines.push(`color: ${JSON.stringify(skill.color)}`);
  if (skill.icon) lines.push(`icon: ${JSON.stringify(skill.icon)}`);
  if (Array.isArray(skill.tools) && skill.tools.length) {
    lines.push(`tools: [${skill.tools.join(', ')}]`);
  }
  lines.push('---');
  return lines.join('\n');
}

class SkillsService {
  constructor(store) {
    this.store = store;
    this.cache = null;
  }

  builtinDir() {
    return resourcesPath('skills');
  }

  customDir() {
    return get().skills;
  }

  enabledIds() {
    return this.store.get('skills.enabled') || [];
  }

  isEnabled(id) {
    return this.enabledIds().includes(id);
  }

  scan() {
    const skills = [];

    const readDir = (root, source) => {
      if (!fs.existsSync(root)) return;
      let entries = [];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        let file = null;
        let id = entry.name;
        if (entry.isDirectory()) {
          const candidate = path.join(root, entry.name, 'SKILL.md');
          if (fs.existsSync(candidate)) file = candidate;
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          file = path.join(root, entry.name);
          id = entry.name.replace(/\.md$/i, '');
        }
        if (!file) continue;
        try {
          const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
          skills.push({
            id: meta.id || id,
            name: meta.name || id,
            description: meta.description || '',
            whenToUse: meta.when_to_use || meta.when || '',
            color: meta.color || '#00f0ff',
            icon: meta.icon || 'sparkles',
            tools: Array.isArray(meta.tools) ? meta.tools : [],
            body: body.trim(),
            source,
            builtin: source === 'builtin',
            enabled: this.isEnabled(meta.id || id),
            path: file,
          });
        } catch (err) {
          console.error('skill parse failed', file, err);
        }
      }
    };

    readDir(this.builtinDir(), 'builtin');
    readDir(this.customDir(), 'custom');
    this.cache = skills;
    return skills;
  }

  list() {
    const skills = this.scan();
    const enabled = this.enabledIds();
    return skills.map((s) => ({ ...s, enabled: enabled.includes(s.id) }));
  }

  get(id) {
    return this.list().find((s) => s.id === id);
  }

  enabled() {
    return this.list().filter((s) => s.enabled);
  }

  toggle(id, enabled) {
    const current = this.enabledIds();
    const next = new Set(current);
    if (enabled) next.add(id);
    else next.delete(id);
    this.store.set('skills.enabled', [...next]);
    return [...next];
  }

  setEnabledMany(ids) {
    this.store.set('skills.enabled', Array.from(new Set(ids)));
  }

  save(skill) {
    const id = skill.id && !String(skill.id).startsWith('builtin')
      ? skill.id
      : `${slugify(skill.name || 'skill')}-${uid(4)}`;
    const dir = path.join(this.customDir(), id);
    fs.mkdirSync(dir, { recursive: true });
    const content = `${buildFrontmatter({ ...skill, name: skill.name || id })}\n\n${String(skill.body || '').trim()}\n`;
    fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
    this.cache = null;
    return { ...skill, id, source: 'custom', builtin: false, path: path.join(dir, 'SKILL.md') };
  }

  duplicate(id) {
    const original = this.get(id);
    if (!original) throw new Error('Скилл не найден');
    const copy = this.save({
      ...original,
      id: null,
      name: `${original.name} (копия)`,
      body: original.body,
    });
    this.toggle(copy.id, true);
    return copy;
  }

  remove(id) {
    const skill = this.get(id);
    if (!skill) return false;
    if (skill.builtin) throw new Error('Встроенный скилл нельзя удалить — можно отключить или клонировать.');
    const dir = path.dirname(skill.path);
    fs.rmSync(dir, { recursive: true, force: true });
    const enabled = this.enabledIds().filter((x) => x !== id);
    this.store.set('skills.enabled', enabled);
    this.cache = null;
    return true;
  }

  importFolder(folder) {
    const stat = fs.statSync(folder);
    if (!stat.isDirectory()) throw new Error('Нужна папка со скиллом');
    const file = path.join(folder, 'SKILL.md');
    if (!fs.existsSync(file)) throw new Error('В папке нет SKILL.md');
    const { meta, body } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
    return this.save({
      name: meta.name || path.basename(folder),
      description: meta.description || '',
      whenToUse: meta.when_to_use || '',
      color: meta.color || '#00f0ff',
      icon: meta.icon || 'sparkles',
      tools: meta.tools || [],
      body,
    });
  }

  async installFromUrl(url, providers) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const { meta, body } = parseFrontmatter(text);
    if (!meta.name && !body.trim()) throw new Error('По URL не найден SKILL.md');
    return this.save({
      name: meta.name || 'Импортированный скилл',
      description: meta.description || '',
      whenToUse: meta.when_to_use || '',
      color: meta.color || '#00f0ff',
      icon: meta.icon || 'sparkles',
      tools: meta.tools || [],
      body,
    });
  }

  async generate(description, providers, options = {}) {
    const provider = options.provider;
    const model = options.model;
    if (!provider) throw new Error('Не выбран провайдер для генерации скилла');
    const system = [
      'Ты — архитектор навыков для ИИ-ассистента PSYCHIC.',
      'Тебе нужно создать SKILL.md — инструкцию, которая включается в системный промпт, когда навык активен.',
      'Формат ответа — ТОЛЬКО содержимое файла, без пояснений:',
      '---',
      'name: "Название"',
      'description: "Краткое описание"',
      'when_to_use: "Когда использовать"',
      'color: "#00f0ff"',
      'icon: "sparkles"',
      'tools: [read_file, write_file, ...]',
      '---',
      '# Заголовок',
      'Подробные пошаговые инструкции для модели...',
      'В инструкции должно быть 200–1200 слов, конкретика, примеры, чек-листы.',
    ].join('\n');
    let text = '';
    for await (const ev of providers.chat(provider, model, [
      { role: 'system', content: system },
      { role: 'user', content: `Создай навык: ${description}` },
    ], { maxTokens: 2000, temperature: 0.8, signal: AbortSignal.timeout(120000) })) {
      if (ev.type === 'text') text += ev.text;
    }
    let cleaned = text.trim();
    const fence = cleaned.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i);
    if (fence) cleaned = fence[1].trim();
    if (!cleaned.startsWith('---')) {
      cleaned = `---\nname: ${JSON.stringify(truncate(description, 40))}\ndescription: ${JSON.stringify(truncate(description, 120))}\nwhen_to_use: "Когда задача связана с этим навыком"\n---\n\n${cleaned}`;
    }
    const { meta, body } = parseFrontmatter(cleaned);
    const saved = this.save({
      name: meta.name || truncate(description, 40),
      description: meta.description || truncate(description, 120),
      whenToUse: meta.when_to_use || 'Когда задача связана с этим навыком',
      color: meta.color || '#00f0ff',
      icon: meta.icon || 'sparkles',
      tools: meta.tools || [],
      body,
    });
    this.toggle(saved.id, true);
    return saved;
  }

  promptForEnabled() {
    const enabled = this.enabled();
    if (!enabled.length) return '';
    const blocks = enabled.map((s) => {
      const tools = s.tools?.length ? `\nДоступные инструменты: ${s.tools.join(', ')}` : '';
      return [
        `### НАВЫК: ${s.name}`,
        s.description ? `Описание: ${s.description}` : '',
        s.whenToUse ? `Когда применять: ${s.whenToUse}` : '',
        tools,
        'Инструкция:',
        truncate(s.body, 3500),
      ].filter(Boolean).join('\n');
    });
    return `\n## АКТИВНЫЕ НАВЫКИ\n\n${blocks.join('\n\n---\n\n')}\n`;
  }

  promptForCatalog() {
    const all = this.list();
    if (!all.length) return '';
    return all
      .map((s) => `- ${s.name}${s.enabled ? ' (включён)' : ''}: ${truncate(s.description, 160)}`)
      .join('\n');
  }
}

module.exports = { SkillsService, parseFrontmatter };

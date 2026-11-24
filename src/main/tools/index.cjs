'use strict';

const { TOOLS, getTool, toolDefinitions } = require('./definitions');
const files = require('./files');
const { runCommand } = require('./shell');
const { searchWeb, fetchUrl } = require('../services/search');
const { withTimeout, truncate } = require('../lib/util');

const implementations = {
  read_file: (args) => files.readFile(args),
  write_file: (args) => files.writeFile(args),
  edit_file: (args) => files.editFile(args),
  list_directory: (args) => files.listDirectory(args),
  search_files: (args) => files.searchFiles(args),
  find_files: (args) => files.findFiles(args),
  delete_path: (args) => files.deletePath(args),
  move_path: (args) => files.movePath(args),
  get_file_info: (args) => files.getFileInfo(args),

  run_command: (args, ctx) => runCommand(args, ctx),

  web_search: async (args, ctx) => {
    const cfg = ctx.store.get('search') || {};
    const { engine, results, error } = await searchWeb(args.query, {
      maxResults: args.maxResults || cfg.maxResults,
      engine: cfg.engine,
      braveKey: cfg.braveKey,
      tavilyKey: cfg.tavilyKey,
      searxUrl: cfg.searxUrl,
    });
    if (!results.length) {
      return {
        text: `По запросу «${args.query}» ничего не найдено.${error ? ` (${error})` : ''}`,
        data: { engine, results: [], error },
      };
    }
    const lines = results.map((r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
    );
    return {
      text: `Результаты поиска (${engine}):\n\n${lines.join('\n\n')}`,
      data: { engine, results },
    };
  },

  fetch_url: async (args) => fetchUrl(args.url, { maxLength: args.maxLength || 30000 }),

  browser_open: async (args, ctx) => {
    const { url } = await ctx.services.browser.navigate(args.url);
    let text = `🌐 Открыто: ${url}`;
    let data = { url };
    if (args.read !== false) {
      try {
        const page = await ctx.services.browser.read();
        text += `\n\n${truncate(page.text, 30000)}`;
        data = { ...data, ...page.data };
      } catch {}
    }
    return { text, data };
  },

  browser_read: async (_args, ctx) => ctx.services.browser.read(),
  browser_eval: async (args, ctx) => ctx.services.browser.evalScript(args.script),

  generate_image: async (args, ctx) => ctx.services.media.generateImage(args),
  generate_music: async (args, ctx) => ctx.services.media.generateMusic(args),
  generate_video: async (args, ctx) => ctx.services.media.generateVideo(args),

  play_music: async (args, ctx) => {
    const result = await ctx.interactions.request('music:play', {
      query: args.query || '',
      action: args.action || 'play',
    }, 45000);
    if (!result || result.error) throw new Error(result?.error || 'Плеер не ответил');
    return { text: result.text || 'Команда отправлена в плеер', data: result };
  },

  save_memory: async (args, ctx) => {
    if (ctx.store.get('memory.enabled') === false) {
      throw new Error('Память выключена в настройках.');
    }
    const item = ctx.services.memory.add(args.content, args.tags);
    return { text: `🧠 Запомнено: ${item.content}`, data: item };
  },
  search_memory: async (args, ctx) => {
    const items = ctx.services.memory.search(args.query, 8);
    return {
      text: items.length
        ? items.map((i) => `- ${i.content}`).join('\n')
        : 'В памяти ничего не найдено.',
      data: { items },
    };
  },

  screenshot: async (_args, ctx) => ctx.services.computer.screenshot(),
  open_app: async (args, ctx) => ctx.services.computer.openApp(args.target),
  clipboard_read: async (_args, ctx) => ctx.services.computer.clipboardRead(),
  clipboard_write: async (args, ctx) => ctx.services.computer.clipboardWrite(args.text),

  ask_user: async (args, ctx) => {
    const answer = await ctx.interactions.request('ask:request', {
      question: args.question,
      options: args.options || [],
    }, 600000);
    if (!answer) throw new Error('Пользователь не ответил');
    return {
      text: `Ответ пользователя: ${answer.answer || '(пусто)'}`,
      data: answer,
    };
  },

  install_skill: async (args, ctx) => {
    const providers = require('../providers');
    if (args.url) {
      const skill = await ctx.services.skills.installFromUrl(args.url, providers);
      return { text: `✅ Скилл установлен: ${skill.name}`, data: skill };
    }
    if (!args.description) throw new Error('Нужен url или description');
    const skill = await ctx.services.skills.generate(args.description, providers, {
      provider: ctx.provider,
      model: ctx.model,
    });
    return { text: `✅ Скилл создан: ${skill.name}`, data: skill };
  },
};

async function executeTool(name, args, ctx) {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Неизвестный инструмент: ${name}` };
  const started = Date.now();
  try {
    if (!ctx?.services?.permissions) throw new Error('Сервис разрешений недоступен');
    await ctx.services.permissions.check(tool, args || {});
    const impl = implementations[name];
    if (!impl) throw new Error(`Инструмент ${name} не реализован`);
    const result = await withTimeout(
      Promise.resolve().then(() => impl(args || {}, ctx)),
      tool.timeout || 180000,
      tool.label || name
    );
    return {
      ok: true,
      duration: Date.now() - started,
      ...(result && typeof result === 'object' ? result : { text: String(result) }),
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || String(err),
      denied: err.code === 'PERMISSION_DENIED',
      duration: Date.now() - started,
    };
  }
}

module.exports = { TOOLS, getTool, toolDefinitions, executeTool, implementations };

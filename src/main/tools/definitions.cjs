'use strict';

/**
 * Реестр инструментов агента. Описание на английском — так модели
 * используют их заметно надёжнее. Локализованные подписи — для UI.
 */

const S = (description) => ({ type: 'string', description });

const TOOLS = [
  // ── Файлы ────────────────────────────────────────────────────────────────
  {
    name: 'read_file',
    label: 'Чтение файла',
    icon: 'file-text',
    category: 'files',
    risk: 'read',
    timeout: 30000,
    description: 'Read a file from disk. Returns text content. Use for code, configs, notes. Images return metadata only.',
    parameters: {
      type: 'object',
      properties: {
        path: S('Absolute path or path relative to the workspace root.'),
        encoding: { type: 'string', enum: ['utf8', 'base64'], description: 'File encoding. Default utf8.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    label: 'Запись файла',
    icon: 'file-plus',
    category: 'files',
    risk: 'write',
    timeout: 30000,
    description: 'Create or overwrite a file with the given content. Creates parent directories automatically.',
    parameters: {
      type: 'object',
      properties: {
        path: S('Target file path.'),
        content: S('Full file content.'),
        append: { type: 'boolean', description: 'Append instead of overwrite. Default false.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    label: 'Правка файла',
    icon: 'file-pen',
    category: 'files',
    risk: 'write',
    timeout: 30000,
    description: 'Edit an existing file by replacing an exact text fragment. Safer than rewriting the whole file.',
    parameters: {
      type: 'object',
      properties: {
        path: S('File path.'),
        oldText: S('Exact text to find. Must match uniquely unless replaceAll is true.'),
        newText: S('Replacement text.'),
        replaceAll: { type: 'boolean', description: 'Replace every occurrence. Default false.' },
      },
      required: ['path', 'oldText', 'newText'],
    },
  },
  {
    name: 'list_directory',
    label: 'Список файлов',
    icon: 'folder-open',
    category: 'files',
    risk: 'read',
    timeout: 20000,
    description: 'List files and folders in a directory with sizes and modification dates.',
    parameters: {
      type: 'object',
      properties: {
        path: S('Directory path. Defaults to workspace.'),
        depth: { type: 'integer', description: 'Depth of recursion (1-3). Default 1.', minimum: 1, maximum: 3 },
        showHidden: { type: 'boolean', description: 'Include hidden files. Default false.' },
      },
    },
  },
  {
    name: 'search_files',
    label: 'Поиск по содержимому',
    icon: 'file-search',
    category: 'files',
    risk: 'read',
    timeout: 60000,
    description: 'Search file CONTENTS for a text query (like grep). Returns file, line number and matching line.',
    parameters: {
      type: 'object',
      properties: {
        query: S('Text or /regex/ to search for.'),
        path: S('Directory to search. Defaults to workspace.'),
        maxResults: { type: 'integer', description: 'Maximum matches. Default 60.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'find_files',
    label: 'Поиск файлов',
    icon: 'search',
    category: 'files',
    risk: 'read',
    timeout: 60000,
    description: 'Find files by NAME using wildcards, e.g. "*.tsx" or "config*.json".',
    parameters: {
      type: 'object',
      properties: {
        pattern: S('Glob pattern, e.g. "*.js", "src/**/*.tsx".'),
        path: S('Directory to search. Defaults to workspace.'),
        maxResults: { type: 'integer', description: 'Maximum results. Default 100.' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'delete_path',
    label: 'Удаление',
    icon: 'trash-2',
    category: 'files',
    risk: 'write',
    timeout: 30000,
    description: 'Delete a file or directory. DANGEROUS — always confirm the exact path with the user first.',
    parameters: {
      type: 'object',
      properties: {
        path: S('Absolute path to delete.'),
        recursive: { type: 'boolean', description: 'Required for directories. Default true.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_path',
    label: 'Перемещение',
    icon: 'folder-input',
    category: 'files',
    risk: 'write',
    timeout: 30000,
    description: 'Move or rename a file or directory.',
    parameters: {
      type: 'object',
      properties: {
        from: S('Source path.'),
        to: S('Destination path.'),
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_file_info',
    label: 'Информация о файле',
    icon: 'info',
    category: 'files',
    risk: 'read',
    timeout: 15000,
    description: 'Get size, dates, type and mime of a file or directory.',
    parameters: {
      type: 'object',
      properties: { path: S('File or directory path.') },
      required: ['path'],
    },
  },

  // ── Командная строка ─────────────────────────────────────────────────────
  {
    name: 'run_command',
    label: 'Команда',
    icon: 'terminal',
    category: 'system',
    risk: 'exec',
    timeout: 180000,
    description: 'Run a shell command (PowerShell on Windows / bash on Linux). Use for builds, git, installs, scripts. Avoid interactive commands.',
    parameters: {
      type: 'object',
      properties: {
        command: S('The command to execute.'),
        cwd: S('Working directory. Defaults to workspace.'),
        timeout: { type: 'integer', description: 'Timeout in ms. Default from settings.' },
      },
      required: ['command'],
    },
  },

  // ── Интернет ─────────────────────────────────────────────────────────────
  {
    name: 'web_search',
    label: 'Поиск в интернете',
    icon: 'globe',
    category: 'web',
    risk: 'network',
    timeout: 45000,
    description: 'Search the internet. Returns titles, URLs and snippets. Use for fresh facts, docs, news, prices.',
    parameters: {
      type: 'object',
      properties: {
        query: S('Search query. Be specific.'),
        maxResults: { type: 'integer', description: 'Number of results (1-15). Default 8.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    label: 'Открыть страницу',
    icon: 'download',
    category: 'web',
    risk: 'network',
    timeout: 45000,
    description: 'Download a URL and return readable text (HTML is converted to text). Use after web_search to read pages.',
    parameters: {
      type: 'object',
      properties: {
        url: S('Full URL including https://'),
        maxLength: { type: 'integer', description: 'Max characters returned. Default 30000.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_open',
    label: 'Открыть в браузере',
    icon: 'app-window',
    category: 'web',
    risk: 'network',
    timeout: 30000,
    description: 'Open a URL in the built-in browser panel (visible to the user).',
    parameters: {
      type: 'object',
      properties: {
        url: S('URL to open.'),
        read: { type: 'boolean', description: 'Also return readable text of the page. Default true.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_read',
    label: 'Прочитать страницу',
    icon: 'scan-text',
    category: 'web',
    risk: 'network',
    timeout: 30000,
    description: 'Read the current page in the built-in browser and return its text content.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'browser_eval',
    label: 'JS в браузере',
    icon: 'code-2',
    category: 'web',
    risk: 'exec',
    timeout: 30000,
    description: 'Execute JavaScript in the built-in browser page and return the result. Powerful — use with care.',
    parameters: {
      type: 'object',
      properties: {
        script: S('JavaScript expression or async IIFE to evaluate.'),
      },
      required: ['script'],
    },
  },

  // ── Медиа ────────────────────────────────────────────────────────────────
  {
    name: 'generate_image',
    label: 'Генерация картинки',
    icon: 'image',
    category: 'media',
    risk: 'media',
    timeout: 180000,
    description: 'Generate an image from a text prompt. Returns the saved file path and a preview.',
    parameters: {
      type: 'object',
      properties: {
        prompt: S('Detailed image prompt.'),
        style: {
          type: 'string',
          enum: ['auto', 'cyberpunk', 'anime', 'photo', '3d', 'oil', 'watercolor', 'pixel', 'logo', 'dark', 'neon'],
          description: 'Visual style preset.',
        },
        width: { type: 'integer', description: 'Width in px. Default from settings.' },
        height: { type: 'integer', description: 'Height in px. Default from settings.' },
        count: { type: 'integer', description: 'How many images (1-4). Default 1.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_music',
    label: 'Генерация музыки',
    icon: 'music',
    category: 'media',
    risk: 'media',
    timeout: 240000,
    description: 'Generate a music track from a description (synthwave, ambient, dark, house...). Saves an audio file.',
    parameters: {
      type: 'object',
      properties: {
        prompt: S('Mood / genre / description.'),
        duration: { type: 'integer', description: 'Duration in seconds (10-180). Default 45.' },
        genre: {
          type: 'string',
          enum: ['synthwave', 'ambient', 'dark', 'house', 'lofi', 'cinematic', 'techno'],
          description: 'Genre preset.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    label: 'Генерация видео',
    icon: 'clapperboard',
    category: 'media',
    risk: 'media',
    timeout: 300000,
    description: 'Create a short video from a prompt (and optionally images). Saves an MP4/WebM file.',
    parameters: {
      type: 'object',
      properties: {
        prompt: S('Description of the video / scenes.'),
        duration: { type: 'integer', description: 'Duration in seconds (3-30). Default 10.' },
        images: { type: 'array', items: { type: 'string' }, description: 'Optional local image paths to animate.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'play_music',
    label: 'Включить музыку',
    icon: 'play',
    category: 'media',
    risk: 'media',
    timeout: 30000,
    description: 'Play music from the local library by name/artist/genre, or open a web search if nothing is found.',
    parameters: {
      type: 'object',
      properties: {
        query: S('Track, artist, genre or playlist name.'),
        action: {
          type: 'string',
          enum: ['play', 'pause', 'resume', 'stop', 'next', 'status'],
          description: 'Playback action. Default play.',
        },
      },
    },
  },

  // ── Память и контекст ────────────────────────────────────────────────────
  {
    name: 'save_memory',
    label: 'Запомнить',
    icon: 'brain',
    category: 'memory',
    risk: 'write',
    timeout: 15000,
    description: 'Save a durable fact about the user, their project or preferences. Use sparingly, only for important facts.',
    parameters: {
      type: 'object',
      properties: {
        content: S('The fact to remember, one sentence.'),
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'search_memory',
    label: 'Поиск в памяти',
    icon: 'database',
    category: 'memory',
    risk: 'read',
    timeout: 15000,
    description: 'Search saved memories by keywords.',
    parameters: {
      type: 'object',
      properties: { query: S('Keywords to search.') },
      required: ['query'],
    },
  },

  // ── Компьютер ────────────────────────────────────────────────────────────
  {
    name: 'screenshot',
    label: 'Скриншот экрана',
    icon: 'monitor',
    category: 'system',
    risk: 'exec',
    timeout: 30000,
    description: 'Take a screenshot of the user\'s screen and attach it to the conversation. Ask before doing this.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'open_app',
    label: 'Открыть приложение',
    icon: 'rocket',
    category: 'system',
    risk: 'exec',
    timeout: 20000,
    description: 'Open an application, file or website on the user\'s computer.',
    parameters: {
      type: 'object',
      properties: {
        target: S('App name, file path or URL.'),
      },
      required: ['target'],
    },
  },
  {
    name: 'clipboard_read',
    label: 'Буфер обмена',
    icon: 'clipboard',
    category: 'system',
    risk: 'read',
    timeout: 10000,
    description: 'Read text from the clipboard.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'clipboard_write',
    label: 'Записать в буфер',
    icon: 'clipboard-check',
    category: 'system',
    risk: 'write',
    timeout: 10000,
    description: 'Put text into the clipboard.',
    parameters: {
      type: 'object',
      properties: { text: S('Text to copy.') },
      required: ['text'],
    },
  },
  {
    name: 'ask_user',
    label: 'Спросить пользователя',
    icon: 'message-circle-question',
    category: 'system',
    risk: 'read',
    timeout: 600000,
    description: 'Ask the user a clarifying question when you are unsure. Provide 2-4 options if possible. Blocks until answered.',
    parameters: {
      type: 'object',
      properties: {
        question: S('The question to ask.'),
        options: { type: 'array', items: { type: 'string' }, description: 'Optional answer choices.' },
      },
      required: ['question'],
    },
  },
  {
    name: 'install_skill',
    label: 'Установить скилл',
    icon: 'sparkles',
    category: 'skills',
    risk: 'network',
    timeout: 60000,
    description: 'Install a skill from a URL pointing to a SKILL.md file, or create one from a description.',
    parameters: {
      type: 'object',
      properties: {
        url: S('URL of a raw SKILL.md file.'),
        description: S('If no URL, a short description of the skill to create.'),
      },
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

function getTool(name) {
  return BY_NAME.get(name);
}

function toolDefinitions() {
  return TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters }));
}

module.exports = { TOOLS, BY_NAME, getTool, toolDefinitions };

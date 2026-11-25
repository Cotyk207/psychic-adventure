import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const renderer = {
  code(...args) {
    const first = args[0];
    let text;
    let lang;
    if (first && typeof first === 'object') {
      text = first.text ?? '';
      lang = first.lang ?? '';
    } else {
      text = first ?? '';
      lang = args[1] ?? '';
    }
    const language = String(lang || '').trim().split(/\s+/)[0].toLowerCase();
    let highlighted;
    try {
      if (language && hljs.getLanguage(language)) {
        highlighted = hljs.highlight(String(text), { language, ignoreIllegals: true }).value;
      } else {
        highlighted = hljs.highlightAuto(String(text)).value;
      }
    } catch {
      highlighted = escapeHtml(String(text));
    }
    return `<div class="code-block" data-lang="${escapeHtml(language || 'text')}">
    <div class="code-head">
      <span class="code-lang">${escapeHtml(language || 'text')}</span>
      <span class="code-actions">
        <button class="code-copy" type="button" data-code="${encodeURIComponent(String(text))}">Копировать</button>
      </span>
    </div>
    <pre><code class="hljs language-${escapeHtml(language || 'text')}">${highlighted}</code></pre>
  </div>`;
  },

  link(...args) {
    const first = args[0];
    let href = '';
    let title = '';
    let label = '';
    if (first && typeof first === 'object') {
      href = first.href ?? '';
      title = first.title ?? '';
      if (Array.isArray(first.tokens) && typeof this?.parser?.parseInline === 'function') {
        try {
          label = this.parser.parseInline(first.tokens);
        } catch {
          label = escapeHtml(first.text ?? href);
        }
      } else {
        label = first.text ? escapeHtml(first.text) : escapeHtml(href);
      }
    } else {
      href = first ?? '';
      title = args[1] ?? '';
      // В marked@12 третий позиционный аргумент — уже отрендеренный HTML/текст ссылки
      label = args[2] != null && args[2] !== '' ? String(args[2]) : escapeHtml(href);
    }
    const safeHref = escapeHtml(String(href || ''));
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${safeHref}"${t} target="_blank" rel="noopener noreferrer">${label}</a>`;
  },

  image(...args) {
    const first = args[0];
    let href;
    let title;
    let text;
    if (first && typeof first === 'object') {
      href = first.href;
      title = first.title;
      text = first.text;
    } else {
      href = first;
      title = args[1];
      text = args[2];
    }
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeHtml(href || '')}" alt="${escapeHtml(text || '')}"${t} loading="lazy" />`;
  },
};

marked.use({
  renderer,
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false,
});

const SANITIZE_OPTS = {
  ADD_ATTR: ['target', 'rel', 'loading'],
  FORBID_TAGS: ['style', 'form', 'input', 'iframe'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload'],
};

export function renderMarkdown(text) {
  const source = String(text ?? '');
  if (!source) return '';
  try {
    const raw = marked.parse(source);
    return DOMPurify.sanitize(raw, SANITIZE_OPTS);
  } catch {
    const fallback = escapeHtml(source).replace(/\r?\n/g, '<br />');
    return DOMPurify.sanitize(fallback, SANITIZE_OPTS);
  }
}

export { escapeHtml };

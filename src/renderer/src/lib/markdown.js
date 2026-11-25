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
  ADD_ATTR: ['target', 'rel', 'loading', 'data-label'],
  FORBID_TAGS: ['style', 'form', 'input', 'iframe'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload'],
};

function enhanceTablesForMobile(cleanHtml) {
  if (!cleanHtml || !cleanHtml.includes('<table') || typeof document === 'undefined') {
    return cleanHtml;
  }
  try {
    const box = document.createElement('div');
    box.innerHTML = cleanHtml;
    const tables = box.querySelectorAll('table');
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
        (th.textContent || '').replace(/\s+/g, ' ').trim()
      );
      if (headers.some(Boolean)) {
        table.classList.add('has-headers');
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          cells.forEach((td, idx) => {
            if (headers[idx]) {
              td.setAttribute('data-label', headers[idx]);
            }
          });
        }
      }
      if (!table.parentElement || !table.parentElement.classList.contains('table-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
    }
    return box.innerHTML;
  } catch {
    return cleanHtml;
  }
}

export function renderMarkdown(text) {
  const source = String(text ?? '');
  if (!source) return '';
  try {
    const raw = marked.parse(source);
    const clean = DOMPurify.sanitize(raw, SANITIZE_OPTS);
    return enhanceTablesForMobile(clean);
  } catch {
    const fallback = escapeHtml(source).replace(/\r?\n/g, '<br />');
    return DOMPurify.sanitize(fallback, SANITIZE_OPTS);
  }
}

export { escapeHtml };

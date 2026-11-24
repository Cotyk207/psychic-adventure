import React, { useMemo, useRef, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { invoke } from '../lib/api';
import { copyToClipboard } from '../lib/utils';

export default function Markdown({ text }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  const [lightbox, setLightbox] = useState(null);
  const ref = useRef(null);

  const onClick = async (event) => {
    const copyBtn = event.target.closest('.code-copy');
    if (copyBtn) {
      event.preventDefault();
      const code = decodeURIComponent(copyBtn.dataset.code || '');
      await copyToClipboard(code);
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Скопировано ✓';
      copyBtn.style.color = 'var(--success)';
      copyBtn.style.borderColor = 'var(--success)';
      setTimeout(() => {
        copyBtn.textContent = original;
        copyBtn.style.color = '';
        copyBtn.style.borderColor = '';
      }, 1400);
      return;
    }
    const img = event.target.closest('img');
    if (img?.src) {
      setLightbox(img.src);
      return;
    }
    const anchor = event.target.closest('a');
    if (anchor?.href) {
      event.preventDefault();
      try {
        await invoke('app:openExternal', { url: anchor.href });
      } catch {}
    }
  };

  return (
    <>
      <div
        ref={ref}
        className="msg-content"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {lightbox && (
        <div className="modal-backdrop" onClick={() => setLightbox(null)} style={{ zIndex: 4000 }}>
          <img
            src={lightbox}
            alt=""
            style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 30px 100px -30px #000' }}
          />
          <button className="icon-btn" style={{ position: 'fixed', top: 16, right: 16 }} onClick={() => setLightbox(null)}>
            ✕
          </button>
        </div>
      )}
    </>
  );
}

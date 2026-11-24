import React, { useEffect } from 'react';
import { on, invoke } from '../lib/api';
import { generateMusicDataUrl } from '../lib/proceduralMusic';
import { renderSlideshow } from '../lib/videoMaker';

/**
 Невидимый компонент-воркер: генерирует музыку и видео силами браузера
 и возвращает результат в main-процесс.
 */
export default function MediaRenderer() {
  useEffect(() => {
    const unsub = on('media:render', async ({ id, kind, payload }) => {
      try {
        if (kind === 'music') {
          const { dataUrl, duration, size } = await generateMusicDataUrl(payload);
          await invoke('media:renderResult', { id, ok: true, dataUrl, ext: 'wav', duration, size });
        } else if (kind === 'video') {
          const result = await renderSlideshow(payload);
          await invoke('media:renderResult', {
            id,
            ok: true,
            dataUrl: result.dataUrl,
            ext: 'webm',
            mime: result.mime,
            size: result.size,
          });
        } else {
          await invoke('media:renderResult', { id, ok: false, error: `Неизвестный тип генерации: ${kind}` });
        }
      } catch (err) {
        await invoke('media:renderResult', { id, ok: false, error: err.message || String(err) }).catch(() => {});
      }
    });
    return unsub;
  }, []);
  return null;
}

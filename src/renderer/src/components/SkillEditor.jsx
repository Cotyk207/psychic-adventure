import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import Icon from './Icon';
import { cn } from '../lib/utils';

const ICONS = ['sparkles', 'code', 'globe', 'terminal', 'image', 'music', 'brain', 'palette', 'file-text', 'database', 'rocket', 'wand', 'layers', 'bug', 'book-open', 'zap', 'shield', 'film', 'languages', 'target'];

export default function SkillEditor({ skill }) {
  const { dispatch, refreshSkills, toast } = useApp();
  const [form, setForm] = useState({
    name: '',
    description: '',
    whenToUse: '',
    color: '#00f0ff',
    icon: 'sparkles',
    tools: '',
    body: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (skill) {
      setForm({
        name: skill.name || '',
        description: skill.description || '',
        whenToUse: skill.whenToUse || '',
        color: skill.color || '#00f0ff',
        icon: skill.icon || 'sparkles',
        tools: (skill.tools || []).join(', '),
        body: skill.body || '',
      });
    }
  }, [skill]);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) {
      toast('Укажи название скилла', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await invoke('skills:save', {
        skill: {
          ...form,
          id: skill?.builtin ? null : skill?.id,
          tools: form.tools.split(',').map((t) => t.trim()).filter(Boolean),
        },
      });
      await invoke('skills:toggle', { id: result.id, enabled: true });
      await refreshSkills();
      dispatch({ type: 'SET_MODAL', modal: null });
      toast(`Скилл «${result.name}» сохранён`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>
      <div className="modal" style={{ width: 'min(720px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="sparkles" size={16} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="modal-title">{skill ? 'Редактирование скилла' : 'Новый скилл'}</div>
            <div className="modal-subtitle">Инструкция попадёт в системный промпт, когда скилл включён</div>
          </div>
          <button className="icon-btn modal-close" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '62vh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>Название</div>
              <input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Web Research" />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>Цвет</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => update('color', e.target.value)}
                  style={{ width: 38, height: 32, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', padding: 2, cursor: 'pointer' }}
                />
                <input className="input mono" value={form.color} onChange={(e) => update('color', e.target.value)} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 5 }}>Описание</div>
            <input
              className="input"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Что умеет этот навык"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 5 }}>Когда использовать</div>
            <input
              className="input"
              value={form.whenToUse}
              onChange={(e) => update('whenToUse', e.target.value)}
              placeholder="Когда нужно найти актуальную информацию в интернете"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>Иконка</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {ICONS.map((name) => (
                  <button
                    key={name}
                    className={cn('icon-btn', form.icon === name && 'active')}
                    onClick={() => update('icon', name)}
                    title={name}
                  >
                    <Icon name={name} size={14} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 5 }}>Инструменты (через запятую)</div>
              <input
                className="input mono"
                value={form.tools}
                onChange={(e) => update('tools', e.target.value)}
                placeholder="web_search, fetch_url"
              />
              <div style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 4 }}>
                Какие инструменты agent может использовать в этом навыке
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 5 }}>Инструкция (Markdown)</div>
            <textarea
              className="textarea"
              style={{ minHeight: 180, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
              value={form.body}
              onChange={(e) => update('body', e.target.value)}
              placeholder="# Как выполнять задачу&#10;1. Сначала уточни…"
            />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner sm" /> : <Icon name="check" size={14} />}
            Сохранить скилл
          </button>
        </div>
      </div>
    </div>
  );
}

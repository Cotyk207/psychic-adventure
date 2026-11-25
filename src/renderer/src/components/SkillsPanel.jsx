import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn } from '../lib/utils';
import Icon from './Icon';

export default function SkillsPanel() {
  const { state, refreshSkills, dispatch, toast } = useApp();
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [description, setDescription] = useState('');

  const skills = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.skills;
    return state.skills.filter((s) =>
      `${s.name} ${s.description} ${s.whenToUse}`.toLowerCase().includes(q)
    );
  }, [state.skills, search]);

  const enabledCount = state.skills.filter((s) => s.enabled).length;

  const toggle = async (skill) => {
    try {
      await invoke('skills:toggle', { id: skill.id, enabled: !skill.enabled });
      await refreshSkills();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const duplicate = async (skill) => {
    try {
      await invoke('skills:duplicate', { id: skill.id });
      await refreshSkills();
      toast(`Скилл «${skill.name}» клонирован`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (skill) => {
    if (!window.confirm(`Удалить скилл «${skill.name}»?`)) return;
    try {
      await invoke('skills:delete', { id: skill.id });
      await refreshSkills();
      toast('Скилл удалён', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const importFolder = async () => {
    try {
      const result = await invoke('skills:importFolder');
      if (result) {
        await refreshSkills();
        toast(`Скилл «${result.name}» импортирован`, 'success');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const generate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    try {
      const result = await invoke('skills:generate', {
        description: description.trim(),
        providerId: state.chat?.provider || state.config?.chat?.defaultProvider,
        model: state.chat?.model || state.config?.chat?.defaultModel,
      });
      await refreshSkills();
      setShowGenerate(false);
      setDescription('');
      toast(`Скилл «${result.name}» создан и включён`, 'success');
    } catch (err) {
      toast(err.message, 'error', 'Генерация скилла');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="panel">
      <div className="skills-toolbar">
        <div className="search-input" style={{ flex: 1, maxWidth: 340 }}>
          <Icon name="search" size={14} />
          <input
            className="input"
            placeholder="Поиск скиллов…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {enabledCount}/{state.skills.length} активно
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => setShowGenerate((v) => !v)}>
          <Icon name="wand" size={13} /> Сгенерировать ИИ
        </button>
        <button className="btn btn-sm" onClick={importFolder}>
          <Icon name="folder-plus" size={13} /> Импорт
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={() => dispatch({ type: 'SET_MODAL', modal: 'skillEditor', data: null })}
        >
          <Icon name="plus" size={13} /> Создать
        </button>
      </div>

      {showGenerate && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg0) 30%, transparent)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: '1 1 200px', minWidth: 0 }}
              placeholder="Опиши навык: «Анализ CSV и построение графиков на Python»…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
              autoFocus
            />
            <button className="btn btn-primary" onClick={generate} disabled={generating || !description.trim()}>
              {generating ? <span className="spinner sm" /> : <Icon name="sparkles" size={14} />}
              Создать
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
            ИИ напишет инструкцию SKILL.md — её можно будет отредактировать вручную.
          </div>
        </div>
      )}

      <div className="panel-body">
        <div className="skills-grid">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={cn('skill-card', !skill.enabled && 'disabled')}
              style={{ '--skill-color': skill.color || 'var(--accent)' }}
            >
              <div className="skill-head">
                <div className="skill-icon">
                  <Icon name={skill.icon} size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="skill-name">{skill.name}</div>
                  <div className="skill-source">
                    {skill.builtin ? 'Встроенный' : 'Пользовательский'}
                    {skill.tools?.length > 0 && ` · ${skill.tools.length} инструментов`}
                  </div>
                </div>
                <button
                  className={cn('switch', skill.enabled && 'on')}
                  onClick={() => toggle(skill)}
                  title={skill.enabled ? 'Отключить' : 'Включить'}
                />
              </div>

              <div className="skill-desc">{skill.description}</div>

              {skill.tools?.length > 0 && (
                <div className="skill-tools">
                  {skill.tools.slice(0, 5).map((tool) => (
                    <span key={tool} className="chip">{tool}</span>
                  ))}
                  {skill.tools.length > 5 && <span className="chip">+{skill.tools.length - 5}</span>}
                </div>
              )}

              <div className="skill-foot">
                <span className="badge" style={{ color: skill.enabled ? 'var(--success)' : 'var(--text-faint)', borderColor: 'var(--border)' }}>
                  {skill.enabled ? 'ACTIVE' : 'OFF'}
                </span>
                <div className="spacer" />
                <button className="icon-btn sm" onClick={() => duplicate(skill)} title="Клонировать">
                  <Icon name="copy" size={12} />
                </button>
                {!skill.builtin && (
                  <button
                    className="icon-btn sm"
                    onClick={() => dispatch({ type: 'SET_MODAL', modal: 'skillEditor', data: skill })}
                    title="Редактировать"
                  >
                    <Icon name="pencil" size={12} />
                  </button>
                )}
                {!skill.builtin && (
                  <button className="icon-btn sm danger" onClick={() => remove(skill)} title="Удалить">
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}

          {!skills.length && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              <Icon name="sparkles" size={38} />
              <div className="empty-title">Скиллы не найдены</div>
              <div className="empty-text">
                Создай свой навык или сгенерируй его с помощью ИИ. Скиллы добавляют в системный промпт
                специализированные инструкции и инструменты.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

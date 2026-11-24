import React from 'react';
import Icon from './Icon';

/**
 * Последний рубеж: если какой-то компонент упал, показываем аккуратный экран
 * вместо белого окна, и приложение можно перезапустить без потери данных.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    try {
      window.psychic?.invoke?.('app:log', { level: 'error', message: `UI crash: ${error?.stack || error}` });
    } catch {}
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-screen">
        <div className="error-panel">
          <div className="error-icon">
            <Icon name="alert-triangle" size={26} />
          </div>
          <div className="error-title">СБОЙ ИНТЕРФЕЙСА</div>
          <div className="error-text">
            Что-то пошло не так в интерфейсе. Данные и диалоги не пострадали —
            они хранятся на диске. Попробуй перезапустить приложение.
          </div>
          <pre className="error-stack">{String(error?.message || error)}</pre>
          <div className="error-actions">
            <button className="btn btn-primary" onClick={this.reset}>
              <Icon name="rotate-ccw" size={14} /> Перезапустить интерфейс
            </button>
            <button className="btn" onClick={() => window.psychic?.invoke?.('app:relaunch')}>
              <Icon name="refresh" size={14} /> Перезапустить PSYCHIC
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => window.psychic?.invoke?.('app:getInfo')
                .then((info) => window.psychic?.invoke?.('app:openPath', { path: info?.paths?.logs }))
                .catch(() => {})}
            >
              <Icon name="folder-open" size={14} /> Логи
            </button>
          </div>
        </div>
      </div>
    );
  }
}

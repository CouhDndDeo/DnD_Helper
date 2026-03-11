/**
 * Шаблоны для рендеринга UI модуля кубов
 * @module DiceTemplates
 */

/**
 * Основной контейнер модуля
 */
export function renderDiceContainer({ systemId, systemName }) {
  return `
    <div class="dice-module" data-system="${systemId || 'dnd5e'}">
      <!-- Заголовок -->
      <header class="dice-header">
        <h2>🎲 Бросок Кубов</h2>
        <span class="system-badge">${systemName || 'НРИ'}</span>
      </header>

      <!-- Форма ввода -->
      <form id="dice-form" class="dice-form" autocomplete="off">
        <div class="input-group">
          <input 
            type="text" 
            id="dice-input" 
            class="dice-input" 
            placeholder="1d20+5 или 4d6kh3"
            aria-label="Формула броска"
            maxlength="100"
          />
          <button type="submit" id="roll-button" class="roll-button">
            🎲 Бросить
          </button>
        </div>
        <div class="input-hints">
          <span>Примеры:</span>
          <button type="button" data-roll="1d20+5" class="hint-btn">1d20+5</button>
          <button type="button" data-roll="2d20kh1" class="hint-btn">2d20kh1</button>
          <button type="button" data-roll="4d6kh3" class="hint-btn">4d6kh3</button>
        </div>
      </form>

      <!-- Результат -->
      <div id="dice-result" class="dice-result" aria-live="polite"></div>

      <!-- Быстрые броски -->
      <section class="quick-rolls-section">
        <h3>⚡ Быстрые броски</h3>
        <div id="quick-rolls" class="quick-rolls-grid"></div>
      </section>

      <!-- История -->
      <section class="history-section">
        <div class="history-header">
          <h3>📜 История</h3>
          <div class="history-actions">
            <button data-export class="btn-icon" title="Экспорт">📤</button>
            <button data-clear-history class="btn-icon" title="Очистить">🗑️</button>
          </div>
        </div>
        <div id="dice-history" class="history-list"></div>
      </section>

      <!-- Индикатор загрузки -->
      <div id="dice-loading" class="dice-loading hidden">
        <div class="loading-spinner"></div>
        <span>Бросаем кубы...</span>
      </div>
    </div>
  `;
}

/**
 * Сетка быстрых бросков
 */
export function renderQuickRolls({ quickRolls, systemId }) {
  if (!quickRolls || quickRolls.length === 0) {
    return '<p class="no-presets">Нет быстрых бросков для этой системы</p>';
  }

  return `
    <div class="quick-rolls-grid system-${systemId}">
      ${quickRolls.map(preset => `
        <button 
          data-quick-roll="${preset.id}" 
          class="quick-roll-btn"
          title="${preset.formula}"
          aria-label="${preset.label}"
        >
          <span class="quick-roll-icon">${preset.icon || '🎲'}</span>
          <span class="quick-roll-label">${preset.label}</span>
          <span class="quick-roll-formula">${preset.formula}</span>
        </button>
      `).join('')}
    </div>
  `;
}

/**
 * Список истории бросков
 */
export function renderHistoryList({ history, empty }) {
  if (empty) {
    return `
      <div class="history-empty">
        <span class="empty-icon">📜</span>
        <p>История пуста</p>
        <small>Сделайте первый бросок!</small>
      </div>
    `;
  }

  return `
    <ul class="history-items">
      ${history.map(roll => `
        <li class="history-item" data-roll-id="${roll.id || roll.formula}">
          <div class="history-main">
            <span class="history-formula">${roll.formula}</span>
            <span class="history-total ${roll.crit?.success ? 'crit-success' : roll.crit?.fail ? 'crit-fail' : ''}">
              ${roll.total}
            </span>
          </div>
          <div class="history-meta">
            <small class="history-time">${roll.timestamp ? new Date(roll.timestamp).toLocaleTimeString() : ''}</small>
            <div class="history-actions">
              <button data-history-action="reroll" data-roll-id="${roll.id || roll.formula}" class="btn-mini" title="Повторить">🔄</button>
              <button data-history-action="copy" data-roll-id="${roll.id || roll.formula}" class="btn-mini" title="Копировать">📋</button>
              <button data-history-action="delete" data-roll-id="${roll.id || roll.formula}" class="btn-mini" title="Удалить">❌</button>
            </div>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * Отображение результата броска
 */
export function renderResult(uiData) {
  const critClass = uiData.crit?.success ? 'crit-success' : 
                    uiData.crit?.fail ? 'crit-fail' : '';

  const breakdownHTML = uiData.breakdown.map(b => {
    const rollsHTML = b.rolls.map((roll, i) => {
      const isUsed = b.used.includes(roll);
      const isCrit20 = roll === 20 && b.dice.includes('20');
      const isCrit1 = roll === 1 && b.dice.includes('20');
      
      return `
        <span class="die ${!isUsed ? 'dropped' : ''} ${isCrit20 ? 'crit-20' : ''} ${isCrit1 ? 'crit-1' : ''}">
          ${roll}
        </span>
      `;
    }).join(' ');

    return `
      <div class="roll-breakdown">
        <span class="dice-type">${b.dice}${b.keep ? ` (${b.keep})` : ''}</span>
        <div class="dice-values">${rollsHTML}</div>
        ${b.modifier !== 0 ? `
          <span class="modifier ${b.modifier > 0 ? 'positive' : 'negative'}">
            ${b.modifier > 0 ? '+' : ''}${b.modifier}
          </span>
        ` : ''}
        <span class="subtotal">= ${b.diceTotal + b.modifier}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="roll-result ${critClass}">
      <div class="result-header">
        <span class="result-formula">${uiData.formula}</span>
        <span class="result-total">${uiData.total}</span>
      </div>
      <div class="result-breakdowns">
        ${breakdownHTML}
      </div>
      ${uiData.crit?.success ? `
        <div class="crit-banner crit-success-banner">
          ✨ Критический успех! ✨
        </div>
      ` : ''}
      ${uiData.crit?.fail ? `
        <div class="crit-banner crit-fail-banner">
          💀 Критический провал! 💀
        </div>
      ` : ''}
      <div class="result-actions">
        <button data-reroll class="btn-secondary btn-small">🔄 Повторить</button>
      </div>
    </div>
  `;
}

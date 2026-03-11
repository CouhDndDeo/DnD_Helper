/**
 * DiceUI — Визуальные компоненты модуля кубов
 * Рендерит интерфейс, анимации и результаты
 * 
 * @module DiceUI
 */

import { formatForUI, renderRollResult } from '../../utils/diceParser.js';
import { 
  renderQuickRolls, 
  renderHistoryList, 
  renderResult 
} from './templates/dice.template.js';

export class DiceUI {
  constructor({ container, module, events }) {
    this.container = container;
    this.module = module;
    this.events = events;
    
    this.elements = {
      input: null,
      rollButton: null,
      resultArea: null,
      historyList: null,
      quickRollsArea: null,
      loadingOverlay: null
    };
    
    this.animations = {
      rolling: null,
      result: null
    };
  }

  /**
   * Рендер основного интерфейса
   * @param {Object} data - Данные для рендера
   */
  async render(data) {
    const { formula, history, quickRolls, system } = data;

    // Находим элементы
    this.elements.input = this.container.querySelector('#dice-input');
    this.elements.rollButton = this.container.querySelector('#roll-button');
    this.elements.resultArea = this.container.querySelector('#dice-result');
    this.elements.historyList = this.container.querySelector('#dice-history');
    this.elements.quickRollsArea = this.container.querySelector('#quick-rolls');
    this.elements.loadingOverlay = this.container.querySelector('#dice-loading');

    // Устанавливаем начальное значение
    if (this.elements.input && formula) {
      this.elements.input.value = formula;
    }

    // Рендерим быстрые броски
    this._renderQuickRolls(quickRolls, system);

    // Рендерим историю
    this._renderHistory(history);

    // Скрываем загрузку
    this._hideLoading();

    // Фокус на поле ввода
    this.elements.input?.focus();
  }

  /**
   * Обновление части интерфейса
   * @param {Object} data 
   */
  async update(data) {
    if (data.quickRolls) {
      this._renderQuickRolls(data.quickRolls, data.system);
    }
    if (data.history) {
      this._renderHistory(data.history);
    }
    if (data.formula && this.elements.input) {
      this.elements.input.value = data.formula;
    }
  }

  /**
   * Отображение результата броска
   * @param {RollResult} result 
   */
  showResult(result) {
    if (!this.elements.resultArea) return;

    const uiData = formatForUI(result, {
      showAll: true,
      highlightCrit: true
    });

    // Анимация появления
    this.elements.resultArea.innerHTML = renderResult(uiData);
    this.elements.resultArea.classList.add('result-enter');
    
    // Удаляем класс анимации после завершения
    setTimeout(() => {
      this.elements.resultArea.classList.remove('result-enter');
    }, 500);

    // Обновляем историю в UI
    this._renderHistory(this.module.history.getRecent(10));
  }

  /**
   * Обновление списка истории
   * @param {RollResult[]} history 
   */
  updateHistory(history) {
    this._renderHistory(history);
  }

  /**
   * Показ индикатора загрузки
   */
  showLoading() {
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.remove('hidden');
      this.elements.rollButton?.setAttribute('disabled', 'true');
    }
  }

  /**
   * Скрытие индикатора загрузки
   */
  hideLoading() {
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.rollButton?.removeAttribute('disabled');
    }
  }

  /**
   * Показ ошибки
   * @param {string} message 
   */
  showError(message) {
    if (!this.elements.resultArea) return;

    this.elements.resultArea.innerHTML = `
      <div class="dice-error" role="alert">
        <span class="error-icon">⚠️</span>
        <span class="error-message">${message}</span>
      </div>
    `;
    this.elements.resultArea.classList.add('result-enter');
  }

  /**
   * Очистка результата
   */
  clearResult() {
    if (this.elements.resultArea) {
      this.elements.resultArea.innerHTML = '';
    }
  }

  /**
   * Анимация броска
   * @param {number} duration - Длительность в мс
   * @returns {Promise}
   */
  async animateRoll(duration = 600) {
    return new Promise((resolve) => {
      this.showLoading();
      
      // Добавляем класс анимации
      this.container.classList.add('dice-rolling');
      
      setTimeout(() => {
        this.container.classList.remove('dice-rolling');
        this.hideLoading();
        resolve();
      }, duration);
    });
  }

  /**
   * Уничтожение UI
   */
  destroy() {
    this.container = null;
    this.elements = {};
    this.animations = {};
  }

  // ============================================================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ============================================================================

  /** @private */
  _renderQuickRolls(quickRolls, system) {
    if (!this.elements.quickRollsArea) return;

    this.elements.quickRollsArea.innerHTML = renderQuickRolls({
      quickRolls,
      systemId: system?.id
    });
  }

  /** @private */
  _renderHistory(history) {
    if (!this.elements.historyList) return;

    this.elements.historyList.innerHTML = renderHistoryList({
      history: history.map(h => formatForUI(h)),
      empty: history.length === 0
    });
  }

  /** @private */
  _hideLoading() {
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.add('hidden');
    }
  }
}

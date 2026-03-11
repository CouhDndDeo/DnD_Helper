/**
 * DiceModule — Модуль бросков кубов
 * Интегрирует DiceParser с UI и хранением истории
 * 
 * @module DiceModule
 */

import { parse, validateFormula, buildAdvantageFormula, buildDaggerheartFormula } from '../../utils/diceParser.js';
import { DiceUI } from './DiceUI.js';
import { DiceHistory } from './DiceHistory.js';
import { renderDiceContainer } from './templates/dice.template.js';

export class DiceModule {
  /**
   * @param {ModuleManager} manager - Менеджер модулей
   * @param {Object} context - Контекст от ModuleManager
   */
  constructor(manager, { dependencies, system, events, id }) {
    this.manager = manager;
    this.system = system;
    this.events = events;
    this.id = id;
    
    // Компоненты
    this.ui = null;
    this.history = null;
    this.storage = null;
    
    // Состояние
    this.state = {
      currentFormula: '',
      isRolling: false,
      lastResult: null,
      quickRolls: []
    };
    
    // Подписки на события
    this._subscriptions = [];
    
    // DOM-элементы
    this.container = null;
  }

  // ============================================================================
  // ЖИЗНЕННЫЙ ЦИКЛ
  // ============================================================================

  /**
   * Инициализация модуля
   * @async
   */
  async init() {
    // Создаём изолированное хранилище
    this.storage = this.manager.storage.createScope(`module:${this.id}:`);
    
    // Инициализируем историю
    this.history = new DiceHistory(this.storage);
    await this.history.load();
    
    // Загружаем настройки
    await this._loadSettings();
    
    // Подписываемся на события
    this._subscribeToEvents();
    
    // Генерируем быстрые броски для текущей системы
    this._generateQuickRolls();
    
    console.log(`[DiceModule] ✅ Initialized for system: ${this.system?.id}`);
  }

  /**
   * Монтирование модуля в DOM
   * @param {HTMLElement} container - Контейнер для рендера
   * @param {Object} options - Опции монтирования
   */
  async mount(container, options = {}) {
    this.container = container;
    
    // Рендерим базовую структуру
    this.container.innerHTML = renderDiceContainer({
      systemId: this.system?.id,
      systemName: this.system?.name
    });
    
    // Инициализируем UI
    this.ui = new DiceUI({
      container: this.container,
      module: this,
      events: this.events
    });
    
    // Рендерим UI компоненты
    await this.ui.render({
      formula: this.state.currentFormula,
      history: this.history.getRecent(10),
      quickRolls: this.state.quickRolls,
      system: this.system
    });
    
    // Навешиваем обработчики
    this._bindEvents();
    
    // Уведомляем о готовности
    this.events.emit('module:mounted', { 
      moduleId: this.id, 
      container 
    });
    
    console.log(`[DiceModule] 🎯 Mounted to DOM`);
  }

  /**
   * Демонтирование модуля
   * @param {HTMLElement} container 
   */
  unmount(container) {
    // Очищаем обработчики
    this._unbindEvents();
    
    // Очищаем подписки на события
    for (const unsubscribe of this._subscriptions) {
      unsubscribe();
    }
    this._subscriptions = [];
    
    // Очищаем UI
    this.ui?.destroy();
    this.ui = null;
    this.container = null;
    
    console.log(`[DiceModule] 🗑️ Unmounted from DOM`);
  }

  /**
   * Уничтожение модуля
   * @async
   */
  async destroy() {
    await this.history.save();
    await this._saveSettings();
    this.history = null;
    this.storage = null;
    this.state = null;
    
    console.log(`[DiceModule] 💀 Destroyed`);
  }

  /**
   * Обработка смены системы
   * @param {RPGSystem} newSystem 
   */
  async onSystemChange(newSystem) {
    console.log(`[DiceModule] 🔄 System changed to: ${newSystem?.id}`);
    
    this.system = newSystem;
    this._generateQuickRolls();
    
    // Перерисовываем UI с новой системой
    if (this.ui) {
      await this.ui.update({
        quickRolls: this.state.quickRolls,
        system: this.system
      });
    }
    
    // Сохраняем настройку
    await this.storage.set('lastSystem', newSystem?.id);
  }

  // ============================================================================
  // ОСНОВНАЯ ЛОГИКА
  // ============================================================================

  /**
   * Выполнение броска
   * @param {string} formula - Формула броска
   * @param {Object} context - Контекст броска
   * @returns {Promise<RollResult>}
   */
  async roll(formula, context = {}) {
    if (this.state.isRolling) {
      console.warn('[DiceModule] Roll in progress, ignoring request');
      return null;
    }

    // Валидация
    const validation = validateFormula(formula);
    if (!validation.valid) {
      this.events.emit('dice:error', { 
        formula, 
        error: validation.error,
        moduleId: this.id 
      });
      throw new Error(validation.error);
    }

    this.state.isRolling = true;
    this.events.emit('dice:rolling', { formula, moduleId: this.id });

    try {
      // Парсинг и бросок
      const result = parse(formula, {
        metadata: {
          system: this.system?.id,
          moduleId: this.id,
          ...context
        }
      });

      // Сохраняем в историю
      await this.history.add(result);
      
      // Обновляем состояние
      this.state.currentFormula = formula;
      this.state.lastResult = result.toJSON();
      this.state.isRolling = false;

      // Эмитим результат
      this.events.emit('dice:rolled', { 
        result: result.toJSON(),
        formula,
        moduleId: this.id 
      });

      // Обновляем UI
      this.ui?.showResult(result);
      
      // Сохраняем настройки
      await this._saveSettings();

      console.log(`[DiceModule] 🎲 Rolled: ${formula} = ${result.total}`);
      return result;

    } catch (error) {
      this.state.isRolling = false;
      this.events.emit('dice:error', { 
        formula, 
        error: error.message,
        moduleId: this.id 
      });
      throw error;
    }
  }

  /**
   * Быстрый бросок из пресетов
   * @param {string} presetId - ID пресета
   * @param {Object} context 
   */
  async quickRoll(presetId, context = {}) {
    const preset = this.state.quickRolls.find(p => p.id === presetId);
    if (!preset) {
      throw new Error(`Quick roll preset "${presetId}" not found`);
    }

    return await this.roll(preset.formula, {
      ...context,
      presetId,
      presetName: preset.label
    });
  }

  /**
   * Повтор последнего броска
   */
  async rerollLast() {
    if (!this.state.currentFormula) {
      console.warn('[DiceModule] No previous roll to reroll');
      return null;
    }

    return await this.roll(this.state.currentFormula, { 
      reroll: true 
    });
  }

  /**
   * Очистка истории
   * @param {boolean} confirm - Требовать подтверждение
   */
  async clearHistory(confirm = true) {
    if (confirm && !window.confirm('Очистить всю историю бросков?')) {
      return;
    }

    await this.history.clear();
    this.ui?.updateHistory([]);
    this.events.emit('dice:history:cleared', { moduleId: this.id });
  }

  /**
   * Экспорт истории
   * @returns {Promise<Object>}
   */
  async exportHistory() {
    return await this.history.export();
  }

  /**
   * Импорт истории
   * @param {Object} data 
   */
  async importHistory(data) {
    await this.history.import(data);
    this.ui?.updateHistory(this.history.getRecent(10));
  }

  // ============================================================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ============================================================================

  /** @private */
  _subscribeToEvents() {
    // Смена системы
    this._subscriptions.push(
      this.events.on('system:changed', (data) => {
        this.onSystemChange(data.system);
      })
    );

    // Глобальный запрос броска (от других модулей)
    this._subscriptions.push(
      this.events.on('dice:request', async (data) => {
        if (data.targetModule === this.id || !data.targetModule) {
          try {
            const result = await this.roll(data.formula, data.context);
            this.events.emit('dice:result', { 
              requestId: data.requestId, 
              result 
            });
          } catch (error) {
            this.events.emit('dice:result', { 
              requestId: data.requestId, 
              error: error.message 
            });
          }
        }
      })
    );
  }

  /** @private */
  _bindEvents() {
    if (!this.container) return;

    // Делегирование событий для кнопок
    this.container.addEventListener('click', (e) => {
      const rollBtn = e.target.closest('[data-roll]');
      const quickBtn = e.target.closest('[data-quick-roll]');
      const historyBtn = e.target.closest('[data-history-action]');
      const exportBtn = e.target.closest('[data-export]');
      const clearBtn = e.target.closest('[data-clear-history]');

      if (rollBtn) {
        e.preventDefault();
        const formula = rollBtn.dataset.roll;
        this.roll(formula);
      }

      if (quickBtn) {
        e.preventDefault();
        const presetId = quickBtn.dataset.quickRoll;
        this.quickRoll(presetId);
      }

      if (historyBtn) {
        e.preventDefault();
        const action = historyBtn.dataset.historyAction;
        const rollId = historyBtn.dataset.rollId;
        this._handleHistoryAction(action, rollId);
      }

      if (exportBtn) {
        e.preventDefault();
        this._handleExport();
      }

      if (clearBtn) {
        e.preventDefault();
        this.clearHistory(true);
      }
    });

    // Обработчик формы ввода
    const form = this.container.querySelector('#dice-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('#dice-input');
        if (input && input.value.trim()) {
          this.roll(input.value.trim());
        }
      });
    }
  }

  /** @private */
  _unbindEvents() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /** @private */
  _generateQuickRolls() {
    const systemId = this.system?.id;
    
    const presets = {
      dnd5e: [
        { id: 'dnd_attack', label: '⚔️ Атака', formula: '1d20+5', icon: '⚔️' },
        { id: 'dnd_damage', label: '🗡️ Урон', formula: '1d8+3', icon: '🗡️' },
        { id: 'dnd_save', label: '🛡️ Спасбросок', formula: '1d20+2', icon: '🛡️' },
        { id: 'dnd_advantage', label: '✨ Преимущество', formula: '2d20kh1+5', icon: '✨' },
        { id: 'dnd_disadvantage', label: '🌑 Помеха', formula: '2d20kl1+5', icon: '🌑' },
        { id: 'dnd_stats', label: '📊 Характеристика', formula: '4d6kh3', icon: '📊' },
        { id: 'dnd_fireball', label: '🔥 Огненный шар', formula: '8d6', icon: '🔥' }
      ],
      daggerheart: [
        { id: 'dh_check', label: '✅ Проверка', formula: '2d12+3', icon: '✅' },
        { id: 'dh_hope', label: '💚 Надежда', formula: '2d12+3+1', icon: '💚' },
        { id: 'dh_fear', label: '💜 Страх', formula: '2d12+3-1', icon: '💜' },
        { id: 'dh_damage', label: '🗡️ Урон', formula: '1d10+2', icon: '🗡️' },
        { id: 'dh_healing', label: '💚 Лечение', formula: '2d8+3', icon: '💚' }
      ]
    };

    this.state.quickRolls = presets[systemId] || presets.dnd5e;
  }

  /** @private */
  async _loadSettings() {
    try {
      const [formula, lastSystem] = await Promise.all([
        this.storage.get('lastFormula', ''),
        this.storage.get('lastSystem', this.system?.id)
      ]);

      this.state.currentFormula = formula;
      
      if (lastSystem && lastSystem !== this.system?.id) {
        // Система изменилась с последнего раза
        console.log(`[DiceModule] System mismatch, updating to ${lastSystem}`);
      }
    } catch (error) {
      console.warn('[DiceModule] Failed to load settings:', error);
    }
  }

  /** @private */
  async _saveSettings() {
    try {
      await this.storage.setMany({
        lastFormula: this.state.currentFormula,
        lastSystem: this.system?.id,
        lastRoll: this.state.lastResult
      });
    } catch (error) {
      console.warn('[DiceModule] Failed to save settings:', error);
    }
  }

  /** @private */
  _handleHistoryAction(action, rollId) {
    switch (action) {
      case 'reroll':
        const roll = this.history.getById(rollId);
        if (roll) {
          this.roll(roll.formula, { reroll: true, originalId: rollId });
        }
        break;
      case 'copy':
        const rollToCopy = this.history.getById(rollId);
        if (rollToCopy) {
          navigator.clipboard?.writeText(rollToCopy.formula);
          this.events.emit('ui:toast', { 
            message: 'Формула скопирована', 
            type: 'success' 
          });
        }
        break;
      case 'delete':
        this.history.delete(rollId);
        this.ui?.updateHistory(this.history.getRecent(10));
        break;
    }
  }

  /** @private */
  async _handleExport() {
    const data = await this.exportHistory();
    const blob = new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `couchhelper-dice-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    
    this.events.emit('ui:toast', { 
      message: 'История экспортирована', 
      type: 'success' 
    });
  }
}

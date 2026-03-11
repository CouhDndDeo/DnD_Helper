/**
 * EventBus — простая реализация паттерна Pub/Sub
 * Для связи между модулями без прямых зависимостей
 * @module EventBus
 */

export class EventBus {
  constructor() {
    /** @private */
    this._listeners = new Map();
    this._onceListeners = new Map();
  }

  /**
   * Подписка на событие
   * @param {string} event - Название события
   * @param {Function} callback - Обработчик
   * @param {Object} options - Опции
   * @param {number} [options.priority=0] - Приоритет (выше = раньше)
   * @returns {Function} Функция для отписки
   * 
   * @example
   * events.on('dice:rolled', (data) => console.log(data));
   * const off = events.on('temp', handler, { priority: 10 });
   * off(); // отписка
   */
  on(event, callback, { priority = 0 } = {}) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }

    const listener = { callback, priority, id: Symbol('listener') };
    const listeners = this._listeners.get(event);
    
    // Вставляем по приоритету (сортировка по убыванию)
    const insertIndex = listeners.findIndex(l => l.priority < priority);
    if (insertIndex === -1) {
      listeners.push(listener);
    } else {
      listeners.splice(insertIndex, 0, listener);
    }

    // Возвращаем функцию отписки
    return () => this.off(event, listener.id);
  }

  /**
   * Одноразовая подписка (автоматическая отписка после первого вызова)
   * @param {string} event 
   * @param {Function} callback 
   * @returns {Function} Функция для отписки
   */
  once(event, callback) {
    if (!this._onceListeners.has(event)) {
      this._onceListeners.set(event, []);
    }

    const listener = { callback, id: Symbol('once') };
    this._onceListeners.get(event).push(listener);

    return () => this._removeOnce(event, listener.id);
  }

  /**
   * Эмиссия события
   * @param {string} event - Название события
   * @param {any} data - Данные события
   * @returns {boolean} Были ли обработчики
   * 
   * @example
   * events.emit('character:updated', { id: 'abc', hp: 15 });
   */
  emit(event, data = {}) {
    let handled = false;

    // 1. Обрабатываем once-слушатели
    if (this._onceListeners.has(event)) {
      const listeners = this._onceListeners.get(event);
      for (const { callback } of listeners) {
        try {
          callback(data, event);
          handled = true;
        } catch (error) {
          console.error(`[EventBus] Error in once-listener for "${event}":`, error);
        }
      }
      this._onceListeners.delete(event); // Очищаем после вызова
    }

    // 2. Обрабатываем обычные слушатели
    if (this._listeners.has(event)) {
      for (const { callback } of this._listeners.get(event)) {
        try {
          callback(data, event);
          handled = true;
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      }
    }

    // 3. Глобальный обработчик для отладки
    if (window.__CH_DEBUG && window.__CH_DEBUG.events) {
      window.__CH_DEBUG.events.push({ event, data, time: Date.now() });
    }

    return handled;
  }

  /**
   * Отписка от события
   * @param {string} event - Название события
   * @param {Symbol|string} listenerId - ID слушателя (из on/once)
   * @returns {boolean} Успешно ли удалено
   */
  off(event, listenerId) {
    let removed = false;

    // Ищем в обычных слушателях
    if (this._listeners.has(event)) {
      const listeners = this._listeners.get(event);
      const index = listeners.findIndex(l => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
        removed = true;
        if (listeners.length === 0) {
          this._listeners.delete(event);
        }
      }
    }

    // Ищем в once-слушателях
    if (this._onceListeners.has(event)) {
      const listeners = this._onceListeners.get(event);
      const index = listeners.findIndex(l => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
        removed = true;
        if (listeners.length === 0) {
          this._onceListeners.delete(event);
        }
      }
    }

    return removed;
  }

  /**
   * Удаление всех слушателей события
   * @param {string} event - Название события (или '*' для всех)
   * @returns {number} Количество удалённых слушателей
   */
  clear(event = '*') {
    let count = 0;

    if (event === '*') {
      count = this._listeners.size + this._onceListeners.size;
      this._listeners.clear();
      this._onceListeners.clear();
    } else {
      if (this._listeners.has(event)) {
        count += this._listeners.get(event).length;
        this._listeners.delete(event);
      }
      if (this._onceListeners.has(event)) {
        count += this._onceListeners.get(event).length;
        this._onceListeners.delete(event);
      }
    }

    return count;
  }

  /**
   * Получение списка активных событий
   * @returns {Object} { eventName: listenerCount }
   */
  getStats() {
    const stats = {};
    
    for (const [event, listeners] of this._listeners) {
      stats[event] = (stats[event] || 0) + listeners.length;
    }
    for (const [event, listeners] of this._onceListeners) {
      stats[event] = (stats[event] || 0) + listeners.length;
    }
    
    return stats;
  }

  /** @private */
  _removeOnce(event, id) {
    if (!this._onceListeners.has(event)) return false;
    const listeners = this._onceListeners.get(event);
    const index = listeners.findIndex(l => l.id === id);
    if (index !== -1) {
      listeners.splice(index, 1);
      if (listeners.length === 0) {
        this._onceListeners.delete(event);
      }
      return true;
    }
    return false;
  }
}

// Экспорт синглтона для удобства (опционально)
export const events = new EventBus();

/**
 * DiceHistory — Управление историей бросков
 * @module DiceHistory
 */

export class DiceHistory {
  constructor(storage) {
    this.storage = storage;
    this.items = [];
    this.maxItems = 100;
  }

  /**
   * Загрузка истории
   * @async
   */
  async load() {
    const data = await this.storage.get('history', []);
    this.items = Array.isArray(data) ? data : [];
    this._trim();
    return this.items;
  }

  /**
   * Сохранение истории
   * @async
   */
  async save() {
    await this.storage.set('history', this.items);
  }

  /**
   * Добавление броска
   * @param {RollResult} result 
   * @async
   */
  async add(result) {
    const item = {
      id: result.id,
      formula: result.formula,
      total: result.total,
      timestamp: result.timestamp,
      metadata: result.metadata
    };

    this.items.unshift(item);
    this._trim();
    await this.save();
    
    return item;
  }

  /**
   * Получение последних бросков
   * @param {number} count 
   * @returns {Object[]}
   */
  getRecent(count = 10) {
    return this.items.slice(0, count);
  }

  /**
   * Получение броска по ID
   * @param {string} id 
   * @returns {Object|null}
   */
  getById(id) {
    return this.items.find(item => item.id === id) || null;
  }

  /**
   * Удаление броска
   * @param {string} id 
   * @async
   */
  async delete(id) {
    const index = this.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.items.splice(index, 1);
      await this.save();
      return true;
    }
    return false;
  }

  /**
   * Очистка истории
   * @async
   */
  async clear() {
    this.items = [];
    await this.save();
  }

  /**
   * Экспорт истории
   * @async
   * @returns {Promise<Object>}
   */
  async export() {
    return {
      version: '1.0',
      exportedAt: Date.now(),
      count: this.items.length,
      items: this.items
    };
  }

  /**
   * Импорт истории
   * @param {Object} data 
   * @async
   */
  async import(data) {
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid import data');
    }
    
    this.items = [...data.items, ...this.items];
    this._trim();
    await this.save();
  }

  /**
   * Поиск по формуле
   * @param {string} formula 
   * @returns {Object[]}
   */
  searchByFormula(formula) {
    return this.items.filter(item => 
      item.formula.toLowerCase().includes(formula.toLowerCase())
    );
  }

  /**
   * Статистика
   * @returns {Object}
   */
  getStats() {
    if (this.items.length === 0) {
      return { total: 0, average: 0, min: 0, max: 0 };
    }

    const totals = this.items.map(i => i.total);
    return {
      total: this.items.length,
      average: totals.reduce((a, b) => a + b, 0) / totals.length,
      min: Math.min(...totals),
      max: Math.max(...totals)
    };
  }

  /** @private */
  _trim() {
    if (this.items.length > this.maxItems) {
      this.items = this.items.slice(0, this.maxItems);
    }
  }
}

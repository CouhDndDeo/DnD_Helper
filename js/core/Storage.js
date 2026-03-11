/**
 * Storage — обёртка над localStorage с поддержкой:
 * - префиксов ключей
 * - скоупов (вложенных пространств имён)
 * - сериализации сложных объектов
 * - асинхронного API (для будущего расширения на IndexedDB)
 * 
 * @module Storage
 */

export class Storage {
  /**
   * @param {string} prefix - Префикс для всех ключей (напр. 'ch_')
   * @param {Object} options - Опции
   * @param {boolean} [options.useCompression=false] - Сжимать большие объекты
   * @param {number} [options.maxKeyLength=100] - Макс. длина ключа
   */
  constructor(prefix = 'ch_', options = {}) {
    this.prefix = prefix;
    this.options = {
      useCompression: false,
      maxKeyLength: 100,
      ...options
    };
    this._scopes = [];
    
    // Проверка поддержки localStorage
    this._available = this._checkAvailability();
    if (!this._available) {
      console.warn('[Storage] localStorage недоступен, используем in-memory fallback');
      this._memory = new Map();
    }
  }

  /**
   * Проверка доступности localStorage
   * @private
   * @returns {boolean}
   */
  _checkAvailability() {
    try {
      const testKey = '__ch_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Формирование полного ключа с префиксом и скоупами
   * @private
   * @param {string} key 
   * @returns {string}
   */
  _makeKey(key) {
    // Валидация ключа
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }
    
    const fullKey = [...this._scopes, key].join(':');
    const prefixed = `${this.prefix}${fullKey}`;
    
    if (prefixed.length > this.options.maxKeyLength) {
      console.warn(`[Storage] Key too long: ${prefixed}`);
    }
    
    return prefixed;
  }

  /**
   * Сериализация значения в строку
   * @private
   * @param {any} value 
   * @returns {string}
   */
  _serialize(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.error('[Storage] Serialization error:', error);
      // Fallback для circular references
      return JSON.stringify(value, (key, val) => 
        typeof val === 'bigint' ? val.toString() : val
      );
    }
  }

  /**
   * Десериализация строки в значение
   * @private
   * @param {string} str 
   * @returns {any}
   */
  _deserialize(str) {
    if (str === null || str === undefined) return null;
    try {
      return JSON.parse(str);
    } catch {
      // Если не JSON, возвращаем как строку
      return str;
    }
  }

  // ============================================================================
  // АСИНХРОННЫЕ МЕТОДЫ (основной API)
  // ============================================================================

  /**
   * Сохранение значения
   * @async
   * @param {string} key - Ключ
   * @param {any} value - Значение (любой сериализуемый тип)
   * @returns {Promise<boolean>} Успех операции
   * 
   * @example
   * await storage.set('user:settings', { theme: 'dark' });
   */
  async set(key, value) {
    const fullKey = this._makeKey(key);
    const serialized = this._serialize(value);

    try {
      if (this._available) {
        localStorage.setItem(fullKey, serialized);
      } else {
        this._memory.set(fullKey, serialized);
      }
      return true;
    } catch (error) {
      // Обработка квоты хранилища
      if (error.name === 'QuotaExceededError') {
        console.warn('[Storage] Quota exceeded, trying to clean up...');
        await this._cleanupOld();
        try {
          if (this._available) {
            localStorage.setItem(fullKey, serialized);
          } else {
            this._memory.set(fullKey, serialized);
          }
          return true;
        } catch {
          return false;
        }
      }
      console.error('[Storage] Set error:', error);
      return false;
    }
  }

  /**
   * Получение значения
   * @async
   * @param {string} key - Ключ
   * @param {any} [defaultValue=null] - Значение по умолчанию
   * @returns {Promise<any>}
   * 
   * @example
   * const settings = await storage.get('user:settings', { theme: 'light' });
   */
  async get(key, defaultValue = null) {
    const fullKey = this._makeKey(key);
    
    try {
      const raw = this._available 
        ? localStorage.getItem(fullKey) 
        : this._memory.get(fullKey);
      
      return raw !== null ? this._deserialize(raw) : defaultValue;
    } catch (error) {
      console.error('[Storage] Get error:', error);
      return defaultValue;
    }
  }

  /**
   * Удаление ключа
   * @async
   * @param {string} key - Ключ
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    const fullKey = this._makeKey(key);
    
    try {
      if (this._available) {
        localStorage.removeItem(fullKey);
      } else {
        this._memory.delete(fullKey);
      }
      return true;
    } catch (error) {
      console.error('[Storage] Delete error:', error);
      return false;
    }
  }

  /**
   * Проверка существования ключа
   * @async
   * @param {string} key 
   * @returns {Promise<boolean>}
   */
  async has(key) {
    const fullKey = this._makeKey(key);
    try {
      if (this._available) {
        return localStorage.getItem(fullKey) !== null;
      } else {
        return this._memory.has(fullKey);
      }
    } catch {
      return false;
    }
  }

  /**
   * Получение всех ключей в текущем скоупе
   * @async
   * @returns {Promise<string[]>}
   */
  async keys() {
    try {
      const prefix = this._makeKey('');
      const allKeys = this._available 
        ? Object.keys(localStorage) 
        : Array.from(this._memory.keys());
      
      return allKeys
        .filter(key => key.startsWith(prefix) && key !== prefix.slice(0, -1))
        .map(key => key.replace(prefix, '').split(':')[0]);
    } catch (error) {
      console.error('[Storage] Keys error:', error);
      return [];
    }
  }

  /**
   * Очистка всех данных в текущем скоупе
   * @async
   * @returns {Promise<number>} Количество удалённых ключей
   */
  async clear() {
    try {
      const keys = await this.keys();
      for (const key of keys) {
        await this.delete(key);
      }
      return keys.length;
    } catch (error) {
      console.error('[Storage] Clear error:', error);
      return 0;
    }
  }

  // ============================================================================
  // СКОУПЫ (вложенные пространства имён)
  // ============================================================================

  /**
   * Создание вложенного скоупа хранилища
   * @param {string} scopeName - Название скоупа
   * @returns {Storage} Новый экземпляр Storage в скоупе
   * 
   * @example
   * const userStorage = storage.createScope('user:123');
   * await userStorage.set('name', 'Alice'); // сохранит как 'ch_user:123:name'
   */
  createScope(scopeName) {
    if (!scopeName || typeof scopeName !== 'string') {
      throw new Error('Scope name must be a non-empty string');
    }
    
    const scoped = new Storage(this.prefix, this.options);
    scoped._scopes = [...this._scopes, scopeName];
    scoped._available = this._available;
    scoped._memory = this._memory; // Shared memory fallback
    
    return scoped;
  }

  /**
   * Получение текущего пути скоупа
   * @returns {string}
   */
  getScopePath() {
    return this._scopes.join(':') || '(root)';
  }

  // ============================================================================
  // УТИЛИТЫ
  // ============================================================================

  /**
   * Массовое сохранение объектов
   * @async
   * @param {Object} data - { key: value, ... }
   * @returns {Promise<Object>} { key: success }
   */
  async setMany(data) {
    const results = {};
    for (const [key, value] of Object.entries(data)) {
      results[key] = await this.set(key, value);
    }
    return results;
  }

  /**
   * Массовое получение значений
   * @async
   * @param {string[]} keys - Массив ключей
   * @returns {Promise<Object>} { key: value, ... }
   */
  async getMany(keys) {
    const results = {};
    for (const key of keys) {
      results[key] = await this.get(key);
    }
    return results;
  }

  /**
   * Экспорт всех данных скоупа (для бэкапа)
   * @async
   * @returns {Promise<Object>}
   */
  async export() {
    const keys = await this.keys();
    const data = {};
    
    for (const key of keys) {
      data[key] = await this.get(key);
    }
    
    return {
      scope: this.getScopePath(),
      timestamp: Date.now(),
      data
    };
  }

  /**
   * Импорт данных (для восстановления)
   * @async
   * @param {Object} exported - Данные из export()
   * @param {boolean} [merge=true] - Объединять с существующими или перезаписать
   * @returns {Promise<boolean>}
   */
  async import(exported, merge = true) {
    if (!merge && !confirm('Это удалит текущие данные в скоупе. Продолжить?')) {
      return false;
    }
    
    if (!merge) {
      await this.clear();
    }
    
    return await this.setMany(exported.data || exported);
  }

  /** @private */
  async _cleanupOld() {
    // Простая стратегия: удалить самые старые ключи с этим префиксом
    try {
      if (!this._available) return;
      
      const prefix = this.prefix;
      const items = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) {
          try {
            const value = JSON.parse(localStorage.getItem(key));
            const timestamp = value?.__meta?.updatedAt || 
                            value?.__meta?.createdAt || 
                            0;
            items.push({ key, timestamp });
          } catch {
            items.push({ key, timestamp: 0 });
          }
        }
      }
      
      // Сортируем по возрастанию (старые первыми) и удаляем 20%
      items.sort((a, b) => a.timestamp - b.timestamp);
      const toDelete = items.slice(0, Math.floor(items.length * 0.2));
      
      for (const { key } of toDelete) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('[Storage] Cleanup error:', error);
    }
  }

  /**
   * Доступность хранилища
   * @type {boolean}
   */
  get available() {
    return this._available;
  }
}

// Экспорт синглтона с дефолтным префиксом
export const storage = new Storage('ch_');

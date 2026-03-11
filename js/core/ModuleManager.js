/**
 * ModuleManager — регистрация, загрузка и управление жизненным циклом модулей
 * Поддерживает зависимости, инициализацию и горячую замену
 * 
 * @module ModuleManager
 */

import { EventBus } from './EventBus.js';

export class ModuleManager {
  constructor(options = {}) {
    /** @public {Map<string, Object>} Зарегистрированные модули */
    this.modules = new Map();
    
    /** @public {RPGSystem|null} Активная игровая система */
    this.activeSystem = null;
    
    /** @private {EventBus} Внутренняя шина событий */
    this._events = new EventBus();
    
    /** @private {Map<string, Function>} Фабрики модулей */
    this._moduleFactories = new Map();
    
    /** @private {Map<string, string[]>} Зависимости модулей */
    this._dependencies = new Map();
    
    /** @public {Object} Опции */
    this.options = {
      autoInit: true,
      strictDeps: true,
      ...options
    };

    this._log('ModuleManager initialized');
  }

  // ============================================================================
  // РЕГИСТРАЦИЯ МОДУЛЕЙ
  // ============================================================================

  /**
   * Регистрация модуля с зависимостями
   * @async
   * @param {string} id - Уникальный ID модуля
   * @param {Function|Class} moduleClass - Конструктор или фабрика модуля
   * @param {string[]} [dependencies=[]] - ID зависимых модулей
   * @returns {Promise<Object>} Экземпляр модуля
   * 
   * @example
   * await manager.registerModule('dice', DiceModule, ['core:system']);
   */
  async registerModule(id, moduleClass, dependencies = []) {
    if (this.modules.has(id)) {
      throw new Error(`Module "${id}" already registered`);
    }

    // Валидация зависимостей
    if (this.options.strictDeps) {
      for (const dep of dependencies) {
        if (!this.modules.has(dep) && !this._moduleFactories.has(dep)) {
          throw new Error(
            `Module "${id}" depends on "${dep}" which is not registered`
          );
        }
      }
    }

    // Сохраняем фабрику и зависимости
    this._moduleFactories.set(id, moduleClass);
    this._dependencies.set(id, dependencies);

    this._log(`📦 Registered module: ${id} (deps: ${dependencies.join(', ') || 'none'})`);
    this._emit('module:registered', { id, dependencies });

    // Авто-инициализация если все зависимости уже загружены
    if (this.options.autoInit && this._areDepsSatisfied(id)) {
      return await this._instantiateModule(id);
    }

    return null; // Будет инициализирован позже
  }

  /**
   * Массовая регистрация модулей
   * @async
   * @param {Object} modules - { id: { class, deps } }
   * @returns {Promise<Map<string, Object>>}
   */
  async registerMany(modules) {
    const results = new Map();
    
    // Первый проход: регистрация всех фабрик
    for (const [id, { class: modClass, deps = [] }] of Object.entries(modules)) {
      await this.registerModule(id, modClass, deps);
    }
    
    // Второй проход: инициализация в порядке зависимостей
    for (const id of modules) {
      if (this._areDepsSatisfied(id) && !this.modules.has(id)) {
        const instance = await this._instantiateModule(id);
        results.set(id, instance);
      }
    }
    
    return results;
  }

  // ============================================================================
  // УПРАВЛЕНИЕ СИСТЕМАМИ
  // ============================================================================

  /**
 * Установка активной игровой системы
 * @param {RPGSystem|string} system - Экземпляр системы ИЛИ ID системы
 * @returns {Promise<boolean>}
 */
async setActiveSystem(system) {
  // Поддержка передачи только ID строки
  if (typeof system === 'string') {
    const systemId = system;
    
    // Проверяем, есть ли уже загруженная система с таким ID
    if (this.activeSystem?.id === systemId) {
      return true; // Уже активна
    }
    
    // Пытаемся загрузить систему динамически
    const systemLoaders = {
      'dnd5e': () => import('../systems/dnd5e.js'),
      'daggerheart': () => import('../systems/daggerheart.js')
    };
    
    const loader = systemLoaders[systemId];
    if (!loader) {
      throw new Error(`No loader for system "${systemId}"`);
    }
    
    try {
      const module = await loader();
      const SystemClass = module[Object.keys(module)[0]];
      
      if (!SystemClass) {
        throw new Error(`No export found in system module "${systemId}"`);
      }
      
      system = new SystemClass(); // Создаём экземпляр
    } catch (error) {
      this._error(`Failed to load system "${systemId}":`, error);
      throw new Error(`Не удалось загрузить систему "${systemId}": ${error.message}`);
    }
  }
  
  // Теперь system — это объект с .id
  if (!system || !system.id) {
    throw new Error('System must have an "id" property');
  }

  const oldSystem = this.activeSystem?.id;
  this.activeSystem = system;

  this._log(`🔄 System changed: ${oldSystem || 'none'} → ${system.id}`);
  
  // Уведомляем модули о смене системы
  await this._notifyModules('onSystemChange', system);
  
  this._emit('system:changed', { 
    systemId: system.id, 
    system,
    previous: oldSystem 
  });

  return true;
}
  // ============================================================================
// В НАЧАЛЕ ФАЙЛА: определение базового пути для GitHub Pages
// ============================================================================
const getRepoBasePath = () => {
  const hostname = window.location.hostname;
  if (hostname.includes('github.io')) {
    // Извлекаем имя репозитория: username.github.io/REPO_NAME/
    const parts = window.location.pathname.split('/').filter(Boolean);
    return `/${parts[0]}/`;
  }
  return '/';
};

const REPO_BASE = getRepoBasePath();
console.log('[ModuleManager] Base path:', REPO_BASE);

// ============================================================================
// МЕТОД loadSystem — ИСПРАВЛЕННЫЙ
// ============================================================================
async loadSystem(systemId, importFn) {
  try {
    const loader = importFn || (() => {
      // ✅ Пути с учётом базового пути репозитория
      const basePath = `${REPO_BASE}js/systems/`;
      
      const loaders = {
        'dnd5e': () => import(`${basePath}dnd5e.js`),
        'daggerheart': () => import(`${basePath}daggerheart.js`)
      };
      
      if (!loaders[systemId]) {
        throw new Error(`No loader for system "${systemId}"`);
      }
      return loaders[systemId]();
    });
    
    const module = await loader();
    const exports = Object.keys(module);
    // Ищем класс, заканчивающийся на "System"
    const SystemClass = module[exports.find(k => k.endsWith('System')) || exports[0]];
    
    if (!SystemClass) {
      throw new Error(`No system class found in module "${systemId}". Exports: ${exports.join(', ')}`);
    }
    
    const system = new SystemClass();
    await this.setActiveSystem(system);
    return system;
    
  } catch (error) {
    console.error(`[ModuleManager] Failed to load system "${systemId}":`, error);
    throw new Error(`Не удалось загрузить систему "${systemId}": ${error.message}`);
  }
}

  // ============================================================================
  // ДОСТУП К МОДУЛЯМ
  // ============================================================================

  /**
   * Получение экземпляра модуля
   * @param {string} id - ID модуля
   * @returns {Object|null}
   */
  getModule(id) {
    return this.modules.get(id) || null;
  }

  /**
   * Проверка наличия модуля
   * @param {string} id 
   * @returns {boolean}
   */
  hasModule(id) {
    return this.modules.has(id);
  }

  /**
   * Получение списка зарегистрированных модулей
   * @returns {string[]}
   */
  getModuleList() {
    return Array.from(this.modules.keys());
  }

  /**
   * Получение активных модулей с методом
   * @param {string} methodName - Название метода для фильтрации
   * @returns {Object[]}
   */
  getModulesWithMethod(methodName) {
    const results = [];
    for (const [id, module] of this.modules) {
      if (typeof module[methodName] === 'function') {
        results.push({ id, module });
      }
    }
    return results;
  }

  // ============================================================================
  // ЖИЗНЕННЫЙ ЦИКЛ
  // ============================================================================

  /**
   * Инициализация всех модулей
   * @async
   * @returns {Promise<Object>} Результаты инициализации
   */
  async initAll() {
    const results = {};
    
    for (const id of this._moduleFactories.keys()) {
      if (!this.modules.has(id) && this._areDepsSatisfied(id)) {
        try {
          results[id] = await this._instantiateModule(id);
        } catch (error) {
          results[id] = { error: error.message };
          this._error(`Failed to init module "${id}":`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Уничтожение модуля (cleanup)
   * @async
   * @param {string} id - ID модуля
   * @returns {Promise<boolean>}
   */
  async destroyModule(id) {
    const module = this.modules.get(id);
    if (!module) return false;

    try {
      // Вызываем метод очистки если есть
      await module.destroy?.();
      await module.unmount?.();
      
      // Удаляем из реестра
      this.modules.delete(id);
      this._log(`🗑️ Destroyed module: ${id}`);
      
      this._emit('module:destroyed', { id });
      return true;
      
    } catch (error) {
      this._error(`Error destroying module "${id}":`, error);
      return false;
    }
  }

  /**
   * Горячая перезагрузка модуля
   * @async
   * @param {string} id - ID модуля
   * @param {Function} newImportFn - Новая функция импорта
   * @returns {Promise<Object>}
   */
  async hotReload(id, newImportFn) {
    if (!this._moduleFactories.has(id)) {
      throw new Error(`Module "${id}" not registered for reload`);
    }

    this._log(`🔄 Hot reloading module: ${id}`);
    this._emit('module:reloading', { id });

    // 1. Уничтожаем старую версию
    await this.destroyModule(id);
    
    // 2. Обновляем фабрику
    const newModule = await newImportFn();
    const NewClass = newModule[Object.keys(newModule)[0]];
    this._moduleFactories.set(id, NewClass);
    
    // 3. Создаём новую версию
    return await this._instantiateModule(id);
  }

  // ============================================================================
  // СОБЫТИЯ
  // ============================================================================

  /**
   * Подписка на события менеджера
   * @param {string} event 
   * @param {Function} callback 
   * @returns {Function} Отписка
   * 
   * События:
   * - module:registered { id, dependencies }
   * - module:initialized { id, instance }
   * - module:destroyed { id }
   * - system:changed { systemId, system, previous }
   */
  on(event, callback) {
    return this._events.on(event, callback);
  }

  /**
   * Эмиссия события
   * @param {string} event 
   * @param {any} data 
   */
  _emit(event, data) {
    this._events.emit(event, {
      ...data,
      timestamp: Date.now(),
      manager: this
    });
  }

  // ============================================================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ============================================================================

  /** @private */
  async _instantiateModule(id) {
    const ModuleClass = this._moduleFactories.get(id);
    const dependencies = this._dependencies.get(id) || [];
    
    if (!ModuleClass) {
      throw new Error(`No factory for module "${id}"`);
    }

    // Собираем зависимости
    const deps = {};
    for (const depId of dependencies) {
      const dep = this.getModule(depId);
      if (!dep && this.options.strictDeps) {
        throw new Error(`Missing dependency "${depId}" for module "${id}"`);
      }
      deps[depId] = dep;
    }

    // Создаём экземпляр
    const instance = new ModuleClass(this, {
      dependencies: deps,
      system: this.activeSystem,
      events: this._events,
      id
    });

    // Сохраняем метаданные
    instance.__meta = {
      id,
      dependencies,
      createdAt: Date.now()
    };

    // Инициализация
    if (typeof instance.init === 'function') {
      await instance.init();
    }

    // Регистрируем
    this.modules.set(id, instance);
    
    this._log(`✅ Initialized module: ${id}`);
    this._emit('module:initialized', { id, instance });

    // Проверяем, не разблокировал ли этот модуль другие
    await this._checkPendingModules();

    return instance;
  }

  /** @private */
  _areDepsSatisfied(moduleId) {
    const deps = this._dependencies.get(moduleId) || [];
    return deps.every(depId => this.modules.has(depId));
  }

  /** @private */
  async _checkPendingModules() {
    for (const id of this._moduleFactories.keys()) {
      if (!this.modules.has(id) && this._areDepsSatisfied(id)) {
        await this._instantiateModule(id);
      }
    }
  }

  /** @private */
  async _notifyModules(methodName, ...args) {
    for (const [id, module] of this.modules) {
      try {
        await module[methodName]?.(...args);
      } catch (error) {
        this._warn(`Module "${id}" error in ${methodName}:`, error);
      }
    }
  }

  /** @private */
  _log(...args) {
    if (window.__CH_DEBUG) {
      console.log('%c[ModuleManager]', 'color:#8b5cf6;font-weight:bold', ...args);
    }
  }

  /** @private */
  _warn(...args) {
    console.warn('%c[ModuleManager]⚠️', 'color:#f59e0b;font-weight:bold', ...args);
  }

  /** @private */
  _error(...args) {
    console.error('%c[ModuleManager]❌', 'color:#ef4444;font-weight:bold', ...args);
  }
}

// Экспорт синглтона
export const moduleManager = new ModuleManager();

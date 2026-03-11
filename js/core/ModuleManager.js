/**
 * ModuleManager — Менеджер модулей для CouchHelper
 * @module ModuleManager
 */

import { EventBus } from './EventBus.js';

// ============================================================================
// ГЛОБАЛЬНЫЕ КОНСТАНТЫ (вне класса, в начале файла)
// ============================================================================

/**
 * Определяет базовый путь для динамических импортов на GitHub Pages
 * @returns {string} Базовый путь, например "/DnD_Helper/"
 */
const getRepoBasePath = () => {
  const hostname = window.location.hostname;
  if (hostname.includes('github.io')) {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0]) {
      return `/${parts[0]}/`;
    }
  }
  return '/';
};

// Вычисляем один раз при загрузке модуля
const REPO_BASE = getRepoBasePath();
console.log('[ModuleManager] Repository base path:', REPO_BASE);

// ============================================================================
// КЛАСС MODULE MANAGER
// ============================================================================

export class ModuleManager {
  constructor(options = {}) {
    this.modules = new Map();
    this.activeSystem = null;
    this._events = new EventBus();
    this._moduleFactories = new Map();
    this._dependencies = new Map();
    
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

  async registerModule(id, moduleClass, dependencies = []) {
    if (this.modules.has(id)) {
      throw new Error(`Module "${id}" already registered`);
    }

    if (this.options.strictDeps) {
      for (const dep of dependencies) {
        if (!this.modules.has(dep) && !this._moduleFactories.has(dep)) {
          throw new Error(
            `Module "${id}" depends on "${dep}" which is not registered`
          );
        }
      }
    }

    this._moduleFactories.set(id, moduleClass);
    this._dependencies.set(id, dependencies);

    this._log(`📦 Registered module: ${id}`);
    this._emit('module:registered', { id, dependencies });

    if (this.options.autoInit && this._areDepsSatisfied(id)) {
      return await this._instantiateModule(id);
    }

    return null;
  }

  // ============================================================================
  // УПРАВЛЕНИЕ СИСТЕМАМИ — ИСПРАВЛЕННЫЙ МЕТОД
  // ============================================================================

  /**
   * Установка активной игровой системы
   * @param {RPGSystem|string} system - Экземпляр системы или ID строкой
   * @returns {Promise<boolean>}
   */
  async setActiveSystem(system) {
    // Поддержка передачи строки (ID системы)
    if (typeof system === 'string') {
      const systemId = system;
      
      // Если уже активна — ничего не делаем
      if (this.activeSystem?.id === systemId) {
        return true;
      }
      
      // Загружаем систему динамически
      try {
        await this.loadSystem(systemId);
        return true;
      } catch (error) {
        this._error(`Failed to load system "${systemId}":`, error);
        throw error;
      }
    }
    
    // Если передан объект системы
    if (!system || !system.id) {
      throw new Error('System must have an "id" property');
    }

    const oldSystem = this.activeSystem?.id;
    this.activeSystem = system;

    this._log(`🔄 System changed: ${oldSystem || 'none'} → ${system.id}`);
    await this._notifyModules('onSystemChange', system);
    
    this._emit('system:changed', { 
      systemId: system.id, 
      system,
      previous: oldSystem 
    });

    return true;
  }

  /**
   * Динамическая загрузка системы по ID
   * @param {string} systemId - 'dnd5e' | 'daggerheart'
   * @returns {Promise<RPGSystem>}
   */
  async loadSystem(systemId) {
    try {
      // ✅ Пути с учётом базового пути репозитория
      const systemPaths = {
        'dnd5e': `${REPO_BASE}js/systems/dnd5e.js`,
        'daggerheart': `${REPO_BASE}js/systems/daggerheart.js`
      };
      
      const path = systemPaths[systemId];
      if (!path) {
        throw new Error(`No path configured for system "${systemId}"`);
      }

      console.log(`[ModuleManager] Loading system from: ${path}`);
      
      const module = await import(path);
      
      // Ищем экспортированный класс системы
      const exports = Object.keys(module);
      const SystemClass = module[
        exports.find(k => k.endsWith('System')) || 
        exports[0] || 
        module.default
      ];
      
      if (!SystemClass || typeof SystemClass !== 'function') {
        throw new Error(
          `No valid system class found in "${systemId}". Available exports: ${exports.join(', ')}`
        );
      }
      
      const system = new SystemClass();
      
      // Устанавливаем как активную (теперь это объект)
      return await this.setActiveSystem(system);
      
    } catch (error) {
      console.error(`[ModuleManager] Failed to load system "${systemId}":`, error);
      throw new Error(`Не удалось загрузить систему "${systemId}": ${error.message}`);
    }
  }

  // ============================================================================
  // ДОСТУП К МОДУЛЯМ
  // ============================================================================

  getModule(id) {
    return this.modules.get(id) || null;
  }

  hasModule(id) {
    return this.modules.has(id);
  }

  getModuleList() {
    return Array.from(this.modules.keys());
  }

  // ============================================================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ============================================================================

  async _instantiateModule(id) {
    const ModuleClass = this._moduleFactories.get(id);
    const dependencies = this._dependencies.get(id) || [];
    
    if (!ModuleClass) {
      throw new Error(`No factory for module "${id}"`);
    }

    const deps = {};
    for (const depId of dependencies) {
      const dep = this.getModule(depId);
      if (!dep && this.options.strictDeps) {
        throw new Error(`Missing dependency "${depId}" for module "${id}"`);
      }
      deps[depId] = dep;
    }

    const instance = new ModuleClass(this, {
      dependencies: deps,
      system: this.activeSystem,
      events: this._events,
      id
    });

    instance.__meta = { id, dependencies, createdAt: Date.now() };

    if (typeof instance.init === 'function') {
      await instance.init();
    }

    this.modules.set(id, instance);
    this._log(`✅ Initialized module: ${id}`);
    this._emit('module:initialized', { id, instance });

    await this._checkPendingModules();
    return instance;
  }

  _areDepsSatisfied(moduleId) {
    const deps = this._dependencies.get(moduleId) || [];
    return deps.every(depId => this.modules.has(depId));
  }

  async _checkPendingModules() {
    for (const id of this._moduleFactories.keys()) {
      if (!this.modules.has(id) && this._areDepsSatisfied(id)) {
        await this._instantiateModule(id);
      }
    }
  }

  async _notifyModules(methodName, ...args) {
    for (const [id, module] of this.modules) {
      try {
        await module[methodName]?.(...args);
      } catch (error) {
        this._warn(`Module "${id}" error in ${methodName}:`, error);
      }
    }
  }

  _emit(event, data) {
    this._events.emit(event, { ...data, timestamp: Date.now(), manager: this });
  }

  on(event, callback) {
    return this._events.on(event, callback);
  }

  _log(...args) {
    if (window.__CH_DEBUG) {
      console.log('%c[ModuleManager]', 'color:#8b5cf6;font-weight:bold', ...args);
    }
  }

  _warn(...args) {
    console.warn('%c[ModuleManager]⚠️', 'color:#f59e0b;font-weight:bold', ...args);
  }

  _error(...args) {
    console.error('%c[ModuleManager]❌', 'color:#ef4444;font-weight:bold', ...args);
  }
}

// Экспорт синглтона (опционально)
export const moduleManager = new ModuleManager();

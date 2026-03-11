/**
 * CouchHelper - Модульный помощник для НРИ
 * Точка входа приложения
 * @module App
 */

import { ModuleManager } from './ModuleManager.js';
import { EventBus } from './EventBus.js';
import { Storage } from './Storage.js';

// ============================================================================
// КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================
const APP_CONFIG = {
  appId: 'couchhelper',
  version: '0.1.0',
  defaultSystem: 'dnd5e',
  availableSystems: ['dnd5e', 'daggerheart'],
  availableModules: ['dice', 'characters', 'generators', 'notes'],
  storagePrefix: 'ch_',
  debug: false
};

// ============================================================================
// ОСНОВНОЙ КЛАСС ПРИЛОЖЕНИЯ
// ============================================================================
export class App {
  constructor(config = {}) {
    // Объединяем конфиги
    this.config = { ...APP_CONFIG, ...config };
    
    // Инициализируем ядро
    this.modules = new ModuleManager();
    this.events = new EventBus();
    this.storage = new Storage(this.config.storagePrefix);
    
    // Состояние приложения
    this.state = {
      currentModule: null,
      currentSystem: this.config.defaultSystem,
      initialized: false,
      loading: false
    };
    
    // DOM-элементы
    this.dom = {
      app: null,
      nav: null,
      container: null,
      systemSelect: null
    };
    
    // Привязываем контекст методов
    this._handleNavClick = this._handleNavClick.bind(this);
    this._handleSystemChange = this._handleSystemChange.bind(this);
  }

  // ============================================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ============================================================================
  
  /**
   * Запуск приложения
   * @async
   */
  async init() {
    if (this.state.initialized) {
      this._log('App already initialized');
      return;
    }

    this._log(`🚀 Запуск CouchHelper v${this.config.version}`);
    this.state.loading = true;
    this._emit('app:loading', { version: this.config.version });

    try {
      // 1. Инициализация DOM
      this._initDOM();
      
      // 2. Загрузка сохранённых настроек
      await this._loadSettings();
      
      // 3. Регистрация базовых модулей
      await this._registerCoreModules();
      
      // 4. Активация системы по умолчанию
      await this.setActiveSystem(this.state.currentSystem);
      
      // 5. Навешиваем обработчики событий
      this._bindEvents();
      
      // 6. Загружаем первый модуль
      await this.loadModule('dice'); // или последний активный из настроек
      
      // 7. Финализация
      this.state.initialized = true;
      this.state.loading = false;
      
      this._emit('app:ready', { 
        system: this.state.currentSystem,
        modules: Array.from(this.modules.modules.keys())
      });
      
      this._log('✅ Приложение готово к работе');
      
    } catch (error) {
      this.state.loading = false;
      this._error('Критическая ошибка при инициализации:', error);
      this._renderError(error);
      throw error;
    }
  }

  /**
   * Инициализация DOM-элементов
   * @private
   */
  _initDOM() {
    this.dom.app = document.getElementById('app');
    this.dom.nav = document.getElementById('main-nav');
    this.dom.container = document.getElementById('module-container');
    this.dom.systemSelect = document.getElementById('system-select');

    if (!this.dom.container) {
      throw new Error('Не найден элемент #module-container');
    }

    this._log('📦 DOM инициализирован');
  }

  /**
   * Загрузка настроек из хранилища
   * @private
   * @async
   */
  async _loadSettings() {
    try {
      const savedSystem = await this.storage.get('settings:system');
      const savedModule = await this.storage.get('settings:lastModule');
      
      if (savedSystem && this.config.availableSystems.includes(savedSystem)) {
        this.state.currentSystem = savedSystem;
        this._log(`📁 Загружена система: ${savedSystem}`);
      }
      
      if (savedModule && this.config.availableModules.includes(savedModule)) {
        this.state.currentModule = savedModule;
        this._log(`📁 Последний модуль: ${savedModule}`);
      }
    } catch (error) {
      this._warn('Не удалось загрузить настройки:', error);
      // Используем значения по умолчанию
    }
  }

  /**
   * Регистрация базовых модулей приложения
   * @private
   * @async
   */
  async _registerCoreModules() {
    const moduleRegistry = {
      'dice': () => import('../modules/dice/DiceModule.js'),
      'characters': () => import('../modules/characters/CharacterModule.js'),
      'generators': () => import('../modules/generators/GeneratorModule.js'),
      'notes': () => import('../modules/notes/NotesModule.js')
    };

    for (const [moduleId, importFn] of Object.entries(moduleRegistry)) {
      try {
        const moduleExport = await importFn();
        const ModuleClass = moduleExport[Object.keys(moduleExport)[0]];
        
        await this.modules.registerModule(moduleId, ModuleClass, []);
        this._log(`📦 Зарегистрирован модуль: ${moduleId}`);
        
      } catch (error) {
        this._warn(`⚠️ Не удалось загрузить модуль "${moduleId}":`, error);
        // Не блокируем запуск приложения из-за одного модуля
      }
    }
  }

  /**
   * Навешивание обработчиков событий
   * @private
   */
  _bindEvents() {
    // Навигация
    if (this.dom.nav) {
      this.dom.nav.addEventListener('click', this._handleNavClick);
    }
    
    // Переключатель систем
    if (this.dom.systemSelect) {
      this.dom.systemSelect.value = this.state.currentSystem;
      this.dom.systemSelect.addEventListener('change', this._handleSystemChange);
    }

    // Глобальные события
    this.events.on('module:loaded', (data) => {
      this._log(`🔄 Модуль загружен: ${data.moduleId}`);
    });

    this.events.on('system:changed', (data) => {
      this._log(`🔄 Система изменена: ${data.systemId}`);
      // Обновляем интерфейс под новую систему
      this._updateSystemUI(data.systemId);
    });

    this._log('🎯 Обработчики событий подключены');
  }

  // ============================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ============================================================================

  /**
   * Загрузка и отображение модуля
   * @param {string} moduleId - ID модуля из availableModules
   * @async
   */
  async loadModule(moduleId) {
    if (!this.config.availableModules.includes(moduleId)) {
      this._warn(`❌ Модуль "${moduleId}" не доступен`);
      return;
    }

    if (this.state.loading) {
      this._log('⏳ Приложение загружается, подождите...');
      return;
    }

    try {
      this.state.loading = true;
      this._emit('module:loading', { moduleId });

      const module = this.modules.getModule(moduleId);
      
      if (!module) {
        throw new Error(`Модуль "${moduleId}" не зарегистрирован`);
      }

      // Очищаем контейнер
      this._clearContainer();

      // Показываем индикатор загрузки
      this._renderLoading();

      // Инициализируем и рендерим модуль
      await module.mount?.(this.dom.container, {
        system: this.modules.activeSystem,
        events: this.events,
        storage: this.storage.createScope(`module:${moduleId}:`)
      });

      // Обновляем состояние
      this.state.currentModule = moduleId;
      this._updateNavActive(moduleId);
      
      // Сохраняем выбор
      await this.storage.set('settings:lastModule', moduleId);

      this._emit('module:loaded', { 
        moduleId, 
        module,
        system: this.state.currentSystem 
      });

      this._log(`✅ Модуль "${moduleId}" загружен`);

    } catch (error) {
      this._error(`❌ Ошибка загрузки модуля "${moduleId}":`, error);
      this._renderModuleError(moduleId, error);
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * Установка активной игровой системы
   * @param {string} systemId - ID системы: 'dnd5e' | 'daggerheart'
   * @async
   */
  async setActiveSystem(systemId) {
    if (!this.config.availableSystems.includes(systemId)) {
      throw new Error(`Система "${systemId}" не поддерживается`);
    }

    this._log(`🔄 Переключение на систему: ${systemId}`);
    this._emit('system:changing', { from: this.state.currentSystem, to: systemId });

    try {
      this.state.loading = true;
      
      // Переключаем систему в менеджере
      await this.modules.setActiveSystem(systemId);
      
      // Обновляем состояние
      this.state.currentSystem = systemId;
      
      // Сохраняем выбор
      await this.storage.set('settings:system', systemId);
      
      // Обновляем UI
      if (this.dom.systemSelect) {
        this.dom.systemSelect.value = systemId;
      }
      
      this._emit('system:changed', { 
        systemId, 
        system: this.modules.activeSystem 
      });

      // Перезагружаем текущий модуль для применения новой системы
      if (this.state.currentModule) {
        await this.loadModule(this.state.currentModule);
      }

      this._log(`✅ Система "${systemId}" активирована`);
      
    } catch (error) {
      this._error(`❌ Ошибка переключения системы:`, error);
      // Откат к предыдущей системе
      if (this.dom.systemSelect) {
        this.dom.systemSelect.value = this.state.currentSystem;
      }
      throw error;
    } finally {
      this.state.loading = false;
    }
  }

  /**
   * Подписка на события приложения
   * @param {string} event - Название события
   * @param {Function} callback - Обработчик
   * @returns {Function} Функция для отписки
   */
  on(event, callback) {
    return this.events.on(event, callback);
  }

  /**
   * Получение текущего состояния
   * @returns {Object} Копия состояния
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Получение активной системы
   * @returns {RPGSystem|null}
   */
  getActiveSystem() {
    return this.modules.activeSystem;
  }

  /**
   * Получение модуля по ID
   * @param {string} moduleId 
   * @returns {Object|null}
   */
  getModule(moduleId) {
    return this.modules.getModule(moduleId);
  }

  // ============================================================================
  // ОБРАБОТЧИКИ СОБЫТИЙ
  // ============================================================================

  /**
   * Обработчик кликов по навигации
   * @private
   * @param {Event} event 
   */
  _handleNavClick(event) {
    const button = event.target.closest('[data-module]');
    if (!button) return;

    event.preventDefault();
    const moduleId = button.dataset.module;
    
    if (moduleId !== this.state.currentModule) {
      this.loadModule(moduleId);
    }
  }

  /**
   * Обработчик смены системы
   * @private
   * @param {Event} event 
   */
  _handleSystemChange(event) {
    const systemId = event.target.value;
    if (systemId && systemId !== this.state.currentSystem) {
      this.setActiveSystem(systemId);
    }
  }

  // ============================================================================
  // РАБОТА С ИНТЕРФЕЙСОМ
  // ============================================================================

  /**
   * Очистка контейнера модулей
   * @private
   */
  _clearContainer() {
    if (this.dom.container) {
      // Вызываем unmount у текущего модуля
      if (this.state.currentModule) {
        const module = this.modules.getModule(this.state.currentModule);
        module.unmount?.(this.dom.container);
      }
      this.dom.container.innerHTML = '';
    }
  }

  /**
   * Рендер индикатора загрузки
   * @private
   */
  _renderLoading() {
    if (!this.dom.container) return;
    
    this.dom.container.innerHTML = `
      <div class="loading-wrapper">
        <div class="loading-spinner" role="status">
          <span class="visually-hidden">Загрузка...</span>
        </div>
        <p class="loading-text">Загружаем модуль...</p>
      </div>
    `;
  }

  /**
   * Рендер ошибки модуля
   * @private
   * @param {string} moduleId 
   * @param {Error} error 
   */
  _renderModuleError(moduleId, error) {
    if (!this.dom.container) return;
    
    this.dom.container.innerHTML = `
      <div class="error-box" role="alert">
        <h3>⚠️ Ошибка модуля "${moduleId}"</h3>
        <p>${error.message || 'Неизвестная ошибка'}</p>
        ${this.config.debug ? `<pre><code>${error.stack || ''}</code></pre>` : ''}
        <button class="btn btn-secondary" onclick="location.reload()">
          🔄 Перезагрузить
        </button>
      </div>
    `;
  }

  /**
   * Рендер критической ошибки
   * @private
   * @param {Error} error 
   */
  _renderError(error) {
    if (!this.dom.container) {
      document.body.innerHTML = `
        <div style="padding:2rem; color:#dc3545; font-family:system-ui;">
          <h1>🔥 Критическая ошибка</h1>
          <p>${error.message}</p>
          ${this.config.debug ? `<pre>${error.stack}</pre>` : ''}
        </div>
      `;
      return;
    }
    
    this.dom.container.innerHTML = `
      <div class="error-box critical" role="alert">
        <h2>🔥 Приложение не удалось запустить</h2>
        <p><strong>${error.message}</strong></p>
        ${this.config.debug ? `<pre><code>${error.stack || ''}</code></pre>` : ''}
        <div class="error-actions">
          <button class="btn btn-primary" onclick="location.reload()">
            🔄 Перезагрузить страницу
          </button>
          <button class="btn btn-secondary" onclick="localStorage.clear(); location.reload();">
            🗑️ Сбросить настройки
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Обновление активной кнопки в навигации
   * @private
   * @param {string} activeModuleId 
   */
  _updateNavActive(activeModuleId) {
    if (!this.dom.nav) return;
    
    const buttons = this.dom.nav.querySelectorAll('[data-module]');
    buttons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.module === activeModuleId);
      btn.setAttribute('aria-current', btn.dataset.module === activeModuleId ? 'page' : 'false');
    });
  }

  /**
   * Обновление интерфейса под систему
   * @private
   * @param {string} systemId 
   */
  _updateSystemUI(systemId) {
    // Добавляем класс системы на body для CSS-тем
    document.body.classList.remove('system-dnd5e', 'system-daggerheart');
    document.body.classList.add(`system-${systemId}`);
    
    // Обновляем data-атрибут для CSS-переменных
    document.body.dataset.system = systemId;
    
    this._log(`🎨 UI обновлён для системы: ${systemId}`);
  }

  // ============================================================================
  // ЛОГИРОВАНИЕ И УТИЛИТЫ
  // ============================================================================

  /**
   * Логирование (только если debug=true)
   * @private
   * @param  {...any} args 
   */
  _log(...args) {
    if (this.config.debug) {
      console.log(`%c[App]`, 'color:#6366f1;font-weight:bold', ...args);
    }
  }

  /**
   * Предупреждение
   * @private
   * @param  {...any} args 
   */
  _warn(...args) {
    console.warn(`%c[App]⚠️`, 'color:#f59e0b;font-weight:bold', ...args);
  }

  /**
   * Ошибка
   * @private
   * @param  {...any} args 
   */
  _error(...args) {
    console.error(`%c[App]❌`, 'color:#ef4444;font-weight:bold', ...args);
  }

  /**
   * Эмиссия события
   * @private
   * @param {string} event 
   * @param {any} data 
   */
  _emit(event, data = {}) {
    this.events.emit(event, {
      ...data,
      timestamp: Date.now(),
      appVersion: this.config.version
    });
  }

  /**
   * Глобальный доступ к экземпляру приложения (для отладки)
   * @public
   */
  static debugExpose(app) {
    if (app.config.debug) {
      window.CouchHelper = {
        app,
        modules: app.modules,
        events: app.events,
        storage: app.storage,
        // Удобные команды для консоли
        help: () => {
          console.log(`
🎲 CouchHelper Debug Console
============================
CH.app          - Экземпляр приложения
CH.modules      - Менеджер модулей
CH.storage      - Хранилище
CH.events       - Шина событий

// Примеры:
CH.app.loadModule('dice')                    - Загрузить модуль кубов
CH.app.setActiveSystem('daggerheart')        - Переключить систему
CH.storage.get('settings:system')           - Прочитать настройку
CH.events.on('dice:rolled', console.log)    - Подписаться на событие
          `);
        }
      };
      console.log('🔧 CouchHelper debug API доступен: window.CouchHelper');
    }
  }
}

// ============================================================================
// ТОЧКА ВХОДА (Автозапуск при загрузке DOM)
// ============================================================================

let appInstance = null;

/**
 * Получение экземпляра приложения (синглтон)
 * @returns {Promise<App>}
 */
export async function getApp() {
  if (!appInstance) {
    appInstance = new App();
    await appInstance.init();
    App.debugExpose(appInstance);
  }
  return appInstance;
}

/**
 * Автозапуск если скрипт подключен напрямую
 */
if (import.meta.url === window.location.href + 'js/core/App.js' || 
    document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    getApp().catch(error => {
      console.error('🔥 Failed to start CouchHelper:', error);
    });
  });
} else {
  // Если модуль импортирован, экспортируем функцию инициализации
  document.addEventListener('DOMContentLoaded', () => {
    getApp().catch(console.error);
  });
}

// Экспорт для тестов
if (typeof window !== 'undefined') {
  window.__CouchHelperApp = App;
}

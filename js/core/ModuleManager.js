export class ModuleManager {
  constructor() {
    this.modules = new Map();
    this.activeSystem = null;
  }

  async registerModule(id, moduleClass, dependencies = []) {
    // Проверка зависимостей
    for (const dep of dependencies) {
      if (!this.modules.has(dep)) {
        throw new Error(`Missing dependency: ${dep}`);
      }
    }
    
    const module = new moduleClass(this);
    await module.init?.();
    this.modules.set(id, module);
    return module;
  }

  setActiveSystem(systemId) {
    const systems = {
      'dnd5e': () => import('../systems/dnd5e.js'),
      'daggerheart': () => import('../systems/daggerheart.js')
    };
    
    if (systems[systemId]) {
      return systems[systemId]().then(mod => {
        const SystemClass = mod[Object.keys(mod)[0]];
        this.activeSystem = new SystemClass();
        // Уведомляем модули о смене системы
        this.emit('system:changed', this.activeSystem);
      });
    }
  }

  getModule(id) {
    return this.modules.get(id);
  }

  emit(event, data) {
    // Простая реализация EventBus
    document.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
}

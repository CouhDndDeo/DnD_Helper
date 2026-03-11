/**
 * Базовый абстрактный класс для игровой системы НРИ
 * Все системы должны наследоваться от этого класса
 */
export class RPGSystem {
  /**
   * @param {string} id - Уникальный идентификатор системы ('dnd5e', 'daggerheart')
   * @param {string} name - Человекочитаемое название
   * @param {Object} config - Конфигурация системы
   */
  constructor(id, name, config = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('RPGSystem: id must be a non-empty string');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('RPGSystem: name must be a non-empty string');
    }
    
    /** @public {string} ID системы */
    this.id = id;
    
    /** @public {string} Название системы */
    this.name = name;
    
    /** @public {Object} Конфигурация */
    this.config = {
      diceTypes: [4, 6, 8, 10, 12, 20],
      ...config
    };
  }

  /**
   * Выполнение броска кубов
   * Должен быть переопределён в наследниках
   * @param {string} formula - Формула броска
   * @param {Object} context - Контекст броска
   * @returns {RollResult|Object} Результат броска
   */
  rollDice(formula, context = {}) {
    throw new Error('rollDice() must be implemented by child class');
  }

  /**
   * Расчёт модификатора характеристики
   * Должен быть переопределён в наследниках
   * @param {number} statValue - Значение характеристики
   * @returns {number} Модификатор
   */
  calculateModifier(statValue) {
    throw new Error('calculateModifier() must be implemented by child class');
  }

  /**
   * Шаблон пустого персонажа для этой системы
   * @returns {Object} Объект-шаблон
   */
  getCharacterTemplate() {
    return {};
  }

  /**
   * Валидация данных персонажа
   * @param {Object} character - Данные персонажа
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateCharacter(character) {
    return { valid: true, errors: [] };
  }

  /**
   * Получение списка характеристик системы
   * @returns {string[]}
   */
  getStatList() {
    return this.config.stats || [];
  }

  /**
   * Форматирование результата для отображения
   * @param {Object} result 
   * @returns {Object}
   */
  formatResult(result) {
    return {
      total: result.total,
      formula: result.formula || '',
      detail: result.detail || {},
      system: this.id
    };
  }
}

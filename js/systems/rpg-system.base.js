/**
 * Базовый абстрактный класс для игровой системы
 */
export class RPGSystem {
  constructor(id, name, config = {}) {
    if (!id || !name) {
      throw new Error('RPGSystem requires id and name');
    }
    this.id = id;
    this.name = name;
    this.config = config;
  }

  /**
   * Бросок кубов по формуле
   * @param {string} formula 
   * @param {Object} context 
   * @returns {RollResult|Object}
   */
  rollDice(formula, context = {}) {
    throw new Error('rollDice() must be implemented by child class');
  }

  /**
   * Расчёт модификатора характеристики
   * @param {number} statValue 
   * @returns {number}
   */
  calculateModifier(statValue) {
    throw new Error('calculateModifier() must be implemented');
  }

  /**
   * Шаблон персонажа для этой системы
   * @returns {Object}
   */
  getCharacterTemplate() {
    return {};
  }

  /**
   * Валидация данных персонажа
   * @param {Object} character 
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateCharacter(character) {
    return { valid: true, errors: [] };
  }
}

// Абстракция для любой игровой системы
export class RPGSystem {
  constructor(id, name, config) {
    this.id = id;
    this.name = name;
    this.config = config;
  }

  // Переопределяется в наследниках
  rollDice(formula, context = {}) {
    throw new Error('rollDice() must be implemented');
  }

  calculateModifier(statValue) {
    throw new Error('calculateModifier() must be implemented');
  }

  getCharacterTemplate() {
    return {};
  }
}

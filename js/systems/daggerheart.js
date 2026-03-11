import { RPGSystem } from './rpg-system.base.js';

export class DaggerheartSystem extends RPGSystem {
  constructor() {
    super('daggerheart', 'Daggerheart', {
      diceTypes: [4, 6, 8, 10, 12],
      coreMechanic: '2d12 + stat',
      hopeFear: true
    });
  }

  // Уникальная механика: 2d12, один "позитивный", один "негативный"
  rollCoreCheck(statModifier, { hope = 0, fear = 0 } = {}) {
    const die1 = Math.floor(Math.random() * 12) + 1;
    const die2 = Math.floor(Math.random() * 12) + 1;
    
    // Определяем какой куб "позитивный" (больший)
    const positive = Math.max(die1, die2);
    const negative = Math.min(die1, die2);
    
    let total = positive - negative + statModifier + hope - fear;
    
    return {
      total,
      detail: { positive, negative, hope, fear, statModifier },
      // Уникальный результат для Daggerheart
      outcome: total >= 10 ? 'full_success' : 
               total >= 6 ? 'partial_success' : 'failure'
    };
  }

  calculateModifier(statValue) {
    // В Daggerheart модификаторы: +0 при 10-11, +1 при 12-13 и т.д.
    return Math.floor((statValue - 10) / 2);
  }

  getCharacterTemplate() {
    return {
      name: '',
      heritage: '',
      class: '',
      level: 1,
      stats: { might: 10, agility: 10, wisdom: 10, knowledge: 10, presence: 10 },
      hope: 3,
      fear: 0,
      stress: 0,
      abilities: []
    };
  }
}

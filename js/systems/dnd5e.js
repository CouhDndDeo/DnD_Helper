import { RPGSystem } from './rpg-system.base.js';
import { parseDiceFormula } from '../utils/diceParser.js';

export class DnD5eSystem extends RPGSystem {
  constructor() {
    super('dnd5e', 'Dungeons & Dragons 5e', {
      diceTypes: [4, 6, 8, 10, 12, 20, 100],
      stats: ['str', 'dex', 'con', 'int', 'wis', 'cha']
    });
  }

  calculateModifier(statValue) {
    return Math.floor((statValue - 10) / 2);
  }

  rollDice(formula, { advantage = false, disadvantage = false } = {}) {
    const result = parseDiceFormula(formula);
    
    // Обработка преимущества/помехи для d20
    if (formula.includes('d20') && (advantage || disadvantage)) {
      const rolls = [
        Math.floor(Math.random() * 20) + 1,
        Math.floor(Math.random() * 20) + 1
      ];
      result.detail = rolls;
      result.total = advantage 
        ? Math.max(...rolls) + (result.total - rolls[0])
        : Math.min(...rolls) + (result.total - rolls[0]);
    }
    
    return result;
  }

  getCharacterTemplate() {
    return {
      name: '',
      class: '',
      level: 1,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      hp: { current: 0, max: 0 },
      ac: 10,
      skills: [],
      inventory: []
    };
  }
}

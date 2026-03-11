/**
 * D&D 5e System Implementation
 */
import { RPGSystem } from '../rpg-system.base.js';
import { parse, buildAdvantageFormula } from '../utils/diceParser.js'; // ✅ Правильный импорт

export class DnD5eSystem extends RPGSystem {
  constructor() {
    super('dnd5e', 'Dungeons & Dragons 5e', {
      diceTypes: [4, 6, 8, 10, 12, 20, 100],
      stats: ['str', 'dex', 'con', 'int', 'wis', 'cha']
    });
  }

  /**
   * Расчёт модификатора характеристики
   */
  calculateModifier(statValue) {
    if (typeof statValue !== 'number') return 0;
    return Math.floor((statValue - 10) / 2);
  }

  /**
   * Бросок кубов для D&D 5e
   * @param {string} formula - Формула (1d20+5, 2d6+3, etc.)
   * @param {Object} context - Контекст {advantage, disadvantage, crit, etc.}
   */
  rollDice(formula, context = {}) {
    const { advantage = false, disadvantage = false } = context;
    
    // Обрабатываем преимущество/помеху автоматически
    let processedFormula = formula;
    if ((advantage || disadvantage) && /1d20/i.test(formula)) {
      processedFormula = buildAdvantageFormula(formula, advantage ? 'advantage' : 'disadvantage');
    }
    
    // Выполняем бросок через парсер
    return parse(processedFormula, { 
      metadata: { 
        system: this.id, 
        advantage, 
        disadvantage,
        ...context 
      } 
    });
  }

  /**
   * Бросок атаки с обработкой критов
   */
  rollAttack(attackBonus, damageFormula, { advantage = false } = {}) {
    const attackRoll = this.rollDice(`1d20+${attackBonus}`, { advantage });
    
    const result = {
      attack: attackRoll,
      damage: null,
      isHit: false,
      isCritical: false
    };

    // Проверка на попадание (условно: нужно 1+ для примера)
    // В реальном приложении здесь сравнение с AC цели
    const natural20 = attackRoll.rolls.some(r => 
      r.diceType === 20 && r.rolls.includes(20)
    );
    const natural1 = attackRoll.rolls.some(r => 
      r.diceType === 20 && r.rolls.includes(1)
    );

    result.isCritical = natural20;
    result.isHit = !natural1 && attackRoll.total >= 1; // Упрощённо

    // Бросок урона если попали
    if (result.isHit && damageFormula) {
      let damageRoll = this.rollDice(damageFormula);
      
      // Крит: удваиваем кубы урона
      if (result.isCritical) {
        damageRoll = this.rollDice(damageFormula.replace(/(\d+)d/, (m, n) => `${parseInt(n)*2}d`));
      }
      result.damage = damageRoll;
    }

    return result;
  }

  /**
   * Шаблон персонажа D&D 5e
   */
  getCharacterTemplate() {
    return {
      name: '',
      race: '',
      class: '',
      subclass: '',
      level: 1,
      background: '',
      alignment: '',
      xp: 0,
      
      // Характеристики
      stats: {
        str: { value: 10, save: 0, skill: {} },
        dex: { value: 10, save: 0, skill: {} },
        con: { value: 10, save: 0, skill: {} },
        int: { value: 10, save: 0, skill: {} },
        wis: { value: 10, save: 0, skill: {} },
        cha: { value: 10, save: 0, skill: {} }
      },
      
      // Боевые параметры
      hp: { current: 10, max: 10, temp: 0 },
      ac: 10,
      speed: 30,
      initiative: 0,
      proficiency: 2,
      
      // Ресурсы
      hitDice: { total: 1, used: 0, type: 'd8' },
      spellSlots: {},
      
      // Прочее
      skills: [],
      proficiencies: [],
      features: [],
      spells: [],
      inventory: [],
      notes: ''
    };
  }

  /**
   * Валидация персонажа
   */
  validateCharacter(character) {
    const errors = [];
    
    if (!character?.name?.trim()) {
      errors.push('Имя персонажа обязательно');
    }
    if (!character?.class?.trim()) {
      errors.push('Класс персонажа обязателен');
    }
    if (character?.level < 1 || character?.level > 20) {
      errors.push('Уровень должен быть от 1 до 20');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

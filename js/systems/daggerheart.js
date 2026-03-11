/**
 * Daggerheart System Implementation
 */
import { RPGSystem } from './rpg-system.base.js';
import { parse, executeRoll } from '../utils/diceParser.js'; // ✅ Правильный импорт

export class DaggerheartSystem extends RPGSystem {
  constructor() {
    super('daggerheart', 'Daggerheart', {
      diceTypes: [4, 6, 8, 10, 12],
      coreMechanic: '2d12 (positive - negative) + stat',
      hopeFear: true,
      stats: ['might', 'agility', 'wisdom', 'knowledge', 'presence']
    });
  }

  /**
   * Расчёт модификатора для Daggerheart
   * +0 при 10-11, +1 при 12-13, +2 при 14-15, и т.д.
   */
  calculateModifier(statValue) {
    if (typeof statValue !== 'number') return 0;
    return Math.floor((statValue - 10) / 2);
  }

  /**
   * Уникальная механика Daggerheart: 2d12
   * Один куб "позитивный" (больший), один "негативный" (меньший)
   * Результат: positive - negative + stat + hope - fear
   */
  rollCoreCheck(statModifier, { hope = 0, fear = 0, context = {} } = {}) {
    const die1 = Math.floor(Math.random() * 12) + 1;
    const die2 = Math.floor(Math.random() * 12) + 1;
    
    const positive = Math.max(die1, die2);
    const negative = Math.min(die1, die2);
    
    const total = positive - negative + statModifier + hope - fear;
    
    // Определение результата по правилам Daggerheart
    let outcome, outcomeText;
    if (total >= 10) {
      outcome = 'full_success';
      outcomeText = '✨ Полный успех';
    } else if (total >= 6) {
      outcome = 'partial_success';
      outcomeText = '👍 Частичный успех';
    } else {
      outcome = 'failure';
      outcomeText = '❌ Провал';
    }

    return {
      total,
      detail: {
        positive,
        negative,
        difference: positive - negative,
        statModifier,
        hope,
        fear,
        rawRolls: [die1, die2]
      },
      outcome,
      outcomeText,
      // Для совместимости с общим API
      rolls: [{ diceType: 12, count: 2, rolls: [die1, die2], used: [positive, negative] }],
      formula: `2d12${hope > 0 ? `+${hope}` : ''}${fear > 0 ? `-${fear}` : ''}+${statModifier}`
    };
  }

  /**
   * Общий метод броска для Daggerheart
   */
  rollDice(formula, context = {}) {
    const { statModifier = 0, hope = 0, fear = 0, isCoreCheck = true } = context;
    
    // Если это основная проверка (2d12 механика)
    if (isCoreCheck && !formula.includes('d')) {
      return this.rollCoreCheck(statModifier, { hope, fear, context });
    }
    
    // Для обычных формул урона/лечения используем парсер
    if (formula && formula.includes('d')) {
      return parse(formula, { 
        metadata: { 
          system: this.id, 
          hope, 
          fear,
          ...context 
        } 
      });
    }
    
    // Фоллбэк: простой бросок
    return {
      total: statModifier + hope - fear,
      detail: { statModifier, hope, fear },
      formula: `${statModifier}${hope > 0 ? `+${hope}` : ''}${fear > 0 ? `-${fear}` : ''}`
    };
  }

  /**
   * Бросок урона с возможностью критов
   */
  rollDamage(damageFormula, { critical = false } = {}) {
    if (critical) {
      // Крит в Daggerheart: +1d12 к урону
      const enhancedFormula = damageFormula.replace(/(\d+d\d+)/, (match) => {
        const [count, die] = match.split('d');
        return `${parseInt(count) + 1}d${die}`;
      });
      return this.rollDice(enhancedFormula, { isCoreCheck: false });
    }
    
    return this.rollDice(damageFormula, { isCoreCheck: false });
  }

  /**
   * Шаблон персонажа Daggerheart
   */
  getCharacterTemplate() {
    return {
      name: '',
      heritage: '',
      class: '',
      subclass: '',
      level: 1,
      background: '',
      alignment: '',
      
      // Характеристики (5 в Daggerheart)
      stats: {
        might: { value: 10, focus: [] },
        agility: { value: 10, focus: [] },
        wisdom: { value: 10, focus: [] },
        knowledge: { value: 10, focus: [] },
        presence: { value: 10, focus: [] }
      },
      
      // Уникальные ресурсы Daggerheart
      hope: { current: 3, max: 3 },
      fear: { current: 0, max: 10 },
      stress: { current: 0, max: 10 },
      
      // Боевые параметры
      hp: { current: 20, max: 20 },
      armor: { class: 10, type: 'none' },
      speed: 30,
      
      // Прогресс
      xp: 0,
      milestones: 0,
      
      // Прочее
      focuses: [],
      abilities: [],
      connections: [],
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
    
    // Проверка значений характеристик (обычно 8-16 при создании)
    for (const [stat, data] of Object.entries(character.stats || {})) {
      if (data?.value < 3 || data?.value > 18) {
        errors.push(`Характеристика ${stat} вне допустимого диапазона`);
      }
    }
    
    // Проверка ресурсов
    if (character?.hope?.current > character?.hope?.max) {
      errors.push('Текущая Надежда не может превышать максимум');
    }
    if (character?.fear?.current > character?.fear?.max) {
      errors.push('Текущий Страх не может превышать максимум');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

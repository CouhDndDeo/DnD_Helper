/**
 * DiceParser — Парсер и исполнитель формул бросков кубов
 * Поддерживает: 1d20+5, 4d6kh3, 2d20kh1 (advantage), мульти-броски
 * 
 * @module DiceParser
 * @example
 * const result = parse('2d20+5', { advantage: true });
 * // { total: 18, detail: {...}, formula: '2d20+5' }
 */

// ============================================================================
// КОНСТАНТЫ И КОНФИГУРАЦИЯ
// ============================================================================

/**
 * Поддерживаемые типы кубов
 */
export const SUPPORTED_DICE = [4, 6, 8, 10, 12, 20, 100];

/**
 * Регулярные выражения для парсинга
 */
export const PATTERNS = {
  // Один бросок: 2d20kh3+5
  singleRoll: /(\d+)?d(\d+)(kh\d+|kl\d+)?([+-]\d+)?/gi,
  
  // Полный формула с несколькими бросками: 1d20+1d6+3
  fullFormula: /^([\d]*d\d+(?:kh\d+|kl\d+)?(?:[+-]\d+)?\s*[+-]*\s*)+$/i,
  
  // Модификатор: +5 или -3
  modifier: /[+-]\d+/g,
  
  // Keep highest/lowest: kh3 или kl2
  keepModifier: /(kh|kl)(\d+)/i,
  
  // Простое число (константа)
  constant: /^-?\d+$/
};

/**
 * Сообщения об ошибках
 */
export const ERROR_MESSAGES = {
  INVALID_FORMULA: 'Неверный формат формулы',
  UNSUPPORTED_DIE: 'Неподдерживаемый тип куба (d{type})',
  INVALID_KEEP: 'Нельзя оставить {keep} из {count} кубов',
  NEGATIVE_COUNT: 'Количество кубов должно быть положительным',
  MISSING_DIE: 'Не указан тип куба после "d"',
  TOO_COMPLEX: 'Слишком сложная формула (макс. {max} бросков)'
};

// ============================================================================
// КЛАССЫ РЕЗУЛЬТАТОВ
// ============================================================================

/**
 * Результат броска одного типа кубов
 */
export class DiceRoll {
  constructor(diceType, count, rolls, modifier = 0, keep = null) {
    /** @type {number} Тип куба (d6, d20, etc.) */
    this.diceType = diceType;
    
    /** @type {number} Количество кубов */
    this.count = count;
    
    /** @type {number[]} Все выпавшие значения */
    this.rolls = rolls;
    
    /** @type {number[]} Использованные значения (после kh/kl) */
    this.used = this._applyKeep(rolls, keep);
    
    /** @type {number} Модификатор */
    this.modifier = modifier;
    
    /** @type {string|null} Тип сохранения (kh/kl) */
    this.keepType = keep?.type || null;
    
    /** @type {number} Сколько сохранено */
    this.keepCount = keep?.count || null;
  }

  /**
   * Применение kh/kl к броскам
   * @private
   * @param {number[]} rolls 
   * @param {Object|null} keep 
   * @returns {number[]}
   */
  _applyKeep(rolls, keep) {
    if (!keep) return rolls;

    const sorted = keep.type === 'kh' 
      ? [...rolls].sort((a, b) => b - a) // По убыванию
      : [...rolls].sort((a, b) => a - b); // По возрастанию
    
    return sorted.slice(0, keep.count);
  }

  /**
   * Сумма использованных кубов
   * @type {number}
   */
  get diceTotal() {
    return this.used.reduce((sum, val) => sum + val, 0);
  }

  /**
   * Полный результат (кубы + модификатор)
   * @type {number}
   */
  get total() {
    return this.diceTotal + this.modifier;
  }

  /**
   * Критический успех (натуральная 20 на d20)
   * @type {boolean}
   */
  get isCriticalSuccess() {
    return this.diceType === 20 && this.used.includes(20);
  }

  /**
   * Критический провал (натуральная 1 на d20)
   * @type {boolean}
   */
  get isCriticalFail() {
    return this.diceType === 20 && this.used.includes(1);
  }

  /**
   * Детализация для UI
   * @returns {Object}
   */
  toJSON() {
    return {
      diceType: this.diceType,
      count: this.count,
      rolls: this.rolls,
      used: this.used,
      modifier: this.modifier,
      keepType: this.keepType,
      keepCount: this.keepCount,
      diceTotal: this.diceTotal,
      total: this.total,
      isCriticalSuccess: this.isCriticalSuccess,
      isCriticalFail: this.isCriticalFail
    };
  }

  /**
   * Строковое представление
   * @returns {string}
   */
  toString() {
    const keepStr = this.keepType 
      ? `${this.keepType}${this.keepCount}` 
      : '';
    const modStr = this.modifier >= 0 
      ? `+${this.modifier}` 
      : `${this.modifier}`;
    
    return `${this.count}d${this.diceType}${keepStr}${modStr} = ${this.total}`;
  }
}

/**
 * Полный результат броска формулы
 */
export class RollResult {
  constructor(formula, rolls, metadata = {}) {
    /** @type {string} Исходная формула */
    this.formula = formula;
    
    /** @type {DiceRoll[]} Массив результатов бросков */
    this.rolls = rolls;
    
    /** @type {Object} Метаданные (контекст, система, etc.) */
    this.metadata = metadata;
    
    /** @type {number} Timestamp броска */
    this.timestamp = Date.now();
    
    /** @type {string|null} ID броска */
    this.id = metadata.id || this._generateId();
  }

  /**
   * Общая сумма всех бросков
   * @type {number}
   */
  get total() {
    return this.rolls.reduce((sum, roll) => sum + roll.total, 0);
  }

  /**
   * Есть ли критический успех в любом броске
   * @type {boolean}
   */
  get hasCriticalSuccess() {
    return this.rolls.some(r => r.isCriticalSuccess);
  }

  /**
   * Есть ли критический провал в любом броске
   * @type {boolean}
   */
  get hasCriticalFail() {
    return this.rolls.some(r => r.isCriticalFail);
  }

  /**
   * Детализация для UI
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      formula: this.formula,
      total: this.total,
      rolls: this.rolls.map(r => r.toJSON()),
      metadata: this.metadata,
      timestamp: this.timestamp,
      hasCriticalSuccess: this.hasCriticalSuccess,
      hasCriticalFail: this.hasCriticalFail
    };
  }

  /**
   * Строковое представление
   * @returns {string}
   */
  toString() {
    const details = this.rolls.map(r => r.toString()).join(', ');
    return `[${this.formula}] ${details} → ${this.total}`;
  }

  /** @private */
  _generateId() {
    return `roll_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ============================================================================
// ОСНОВНЫЕ ФУНКЦИИ ПАРСЕРА
// ============================================================================

/**
 * Парсинг одной части формулы (например, "2d20kh1+5")
 * @param {string} part - Часть формулы
 * @returns {Object} Распарсенные компоненты
 * 
 * @example
 * parseRollPart('2d20kh1+5')
 * // { count: 2, die: 20, keep: {type: 'kh', count: 1}, modifier: 5 }
 */
export function parseRollPart(part) {
  const clean = part.trim().replace(/\s+/g, '');
  
  // Проверка на простую константу
  if (PATTERNS.constant.test(clean)) {
    return {
      count: 0,
      die: 0,
      keep: null,
      modifier: parseInt(clean, 10),
      isConstant: true
    };
  }

  const match = clean.match(PATTERNS.singleRoll);
  if (!match) {
    throw new Error(`${ERROR_MESSAGES.INVALID_FORMULA}: "${part}"`);
  }

  // Извлекаем группы из regex
  const fullMatch = match[0];
  const countMatch = fullMatch.match(/^(\d+)?d/);
  const dieMatch = fullMatch.match(/d(\d+)/);
  const keepMatch = fullMatch.match(PATTERNS.keepModifier);
  const modMatch = fullMatch.match(/([+-]\d+)$/);

  const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : 1;
  const die = dieMatch?.[1] ? parseInt(dieMatch[1], 10) : 0;
  
  if (die === 0) {
    throw new Error(ERROR_MESSAGES.MISSING_DIE);
  }

  if (!SUPPORTED_DICE.includes(die)) {
    throw new Error(ERROR_MESSAGES.UNSUPPORTED_DIE.replace('{type}', die));
  }

  if (count <= 0) {
    throw new Error(ERROR_MESSAGES.NEGATIVE_COUNT);
  }

  // Парсинг keep highest/lowest
  let keep = null;
  if (keepMatch) {
    const keepType = keepMatch[1].toLowerCase();
    const keepCount = parseInt(keepMatch[2], 10);
    
    if (keepCount > count || keepCount <= 0) {
      throw new Error(
        ERROR_MESSAGES.INVALID_KEEP
          .replace('{keep}', keepCount)
          .replace('{count}', count)
      );
    }
    
    keep = { type: keepType, count: keepCount };
  }

  // Парсинг модификатора
  let modifier = 0;
  if (modMatch) {
    modifier = parseInt(modMatch[1], 10);
  }

  return { count, die, keep, modifier, isConstant: false };
}

/**
 * Разделение формулы на отдельные броски
 * @param {string} formula 
 * @returns {string[]} Массив частей формулы
 * 
 * @example
 * splitFormula('1d20+1d6+3')
 * // ['1d20', '1d6', '+3']
 */
export function splitFormula(formula) {
  const clean = formula.trim().replace(/\s+/g, '');
  
  // Разделяем по + и -, сохраняя разделители
  const parts = [];
  let current = '';
  let i = 0;
  
  while (i < clean.length) {
    const char = clean[i];
    
    if (char === '+' || char === '-') {
      // Проверяем, не часть ли это экспоненты (e.g., 1e-5)
      if (current.includes('d') || current === '') {
        if (current) parts.push(current);
        current = char;
      } else {
        current += char;
      }
    } else {
      current += char;
    }
    i++;
  }
  
  if (current) parts.push(current);
  
  return parts.filter(p => p && p !== '+' && p !== '-');
}

/**
 * Выполнение броска одного типа кубов
 * @param {number} count - Количество кубов
 * @param {number} die - Тип куба
 * @param {Object} options - Опции
 * @param {Object|null} [options.keep] - {type: 'kh'|'kl', count: number}
 * @param {number} [options.modifier=0] - Модификатор
 * @param {Function} [options.rng=Math.random] - Функция генерации случайных чисел
 * @returns {DiceRoll}
 * 
 * @example
 * executeRoll(2, 20, { keep: {type: 'kh', count: 1}, modifier: 5 })
 */
export function executeRoll(count, die, options = {}) {
  const { keep = null, modifier = 0, rng = Math.random } = options;
  
  // Генерируем броски
  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(rng() * die) + 1);
  }
  
  return new DiceRoll(die, count, rolls, modifier, keep);
}

/**
 * Парсинг и выполнение полной формулы
 * @param {string} formula - Формула броска
 * @param {Object} options - Опции
 * @param {Object} [options.metadata={}] - Метаданные для результата
 * @param {Function} [options.rng=Math.random] - Кастомная RNG
 * @param {boolean} [options.validate=true] - Валидировать формулу
 * @returns {RollResult}
 * 
 * @example
 * parse('2d20kh1+1d6+3', { metadata: { skill: 'attack' } })
 */
export function parse(formula, options = {}) {
  const { metadata = {}, rng = Math.random, validate = true } = options;
  
  if (!formula || typeof formula !== 'string') {
    throw new Error(ERROR_MESSAGES.INVALID_FORMULA);
  }

  const clean = formula.trim().replace(/\s+/g, '');
  
  // Валидация
  if (validate && !PATTERNS.fullFormula.test(clean)) {
    // Пробуем исправить частые ошибки
    const fixed = _tryFixFormula(clean);
    if (!PATTERNS.fullFormula.test(fixed)) {
      throw new Error(`${ERROR_MESSAGES.INVALID_FORMULA}: "${formula}"`);
    }
    formula = fixed;
  }

  // Разделяем на части
  const parts = splitFormula(formula);
  
  if (parts.length > 10) {
    throw new Error(
      ERROR_MESSAGES.TOO_COMPLEX.replace('{max}', '10')
    );
  }

  // Выполняем каждый бросок
  const rolls = [];
  for (const part of parts) {
    const parsed = parseRollPart(part);
    
    if (parsed.isConstant) {
      // Простая константа
      rolls.push(new DiceRoll(0, 0, [], parsed.modifier, null));
    } else {
      // Бросок кубов
      const roll = executeRoll(parsed.count, parsed.die, {
        keep: parsed.keep,
        modifier: parsed.modifier,
        rng
      });
      rolls.push(roll);
    }
  }

  return new RollResult(formula, rolls, metadata);
}

/**
 * Быстрый бросок без парсинга (для производительности)
 * @param {number} count 
 * @param {number} die 
 * @param {number} [modifier=0] 
 * @returns {number} Сумма
 */
export function quickRoll(count, die, modifier = 0) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * die) + 1;
  }
  return total + modifier;
}

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Попытка исправить частые ошибки в формуле
 * @private
 * @param {string} formula 
 * @returns {string}
 */
function _tryFixFormula(formula) {
  let fixed = formula;
  
  // Добавляем 1 перед d если нет числа (d20 → 1d20)
  fixed = fixed.replace(/(^|[+-])d/gi, '$11d');
  
  // Убираем двойные операторы (1d20++5 → 1d20+5)
  fixed = fixed.replace(/([+-]){2,}/g, '$1');
  
  // Убираем пробелы
  fixed = fixed.replace(/\s+/g, '');
  
  return fixed;
}

/**
 * Форматирование результата для отображения в UI
 * @param {RollResult} result 
 * @param {Object} options 
 * @param {boolean} [options.showAll=true] - Показывать все кубы или только использованные
 * @param {boolean} [options.highlightCrit=true] - Подсвечивать криты
 * @returns {Object}
 */
export function formatForUI(result, options = {}) {
  const { showAll = true, highlightCrit = true } = options;
  
  return {
    formula: result.formula,
    total: result.total,
    breakdown: result.rolls.map(roll => ({
      dice: `${roll.count}d${roll.diceType}`,
      rolls: showAll ? roll.rolls : roll.used,
      used: roll.used,
      modifier: roll.modifier,
      keep: roll.keepType ? `${roll.keepType}${roll.keepCount}` : null,
      crit: highlightCrit ? {
        success: roll.isCriticalSuccess,
        fail: roll.isCriticalFail
      } : null
    })),
    crit: {
      success: result.hasCriticalSuccess,
      fail: result.hasCriticalFail
    }
  };
}

/**
 * Генерация формулы для преимущества/помехи (D&D)
 * @param {string} baseFormula - Базовая формула (например, '1d20+5')
 * @param {'advantage'|'disadvantage'|null} mode 
 * @returns {string}
 */
export function buildAdvantageFormula(baseFormula, mode) {
  if (!mode) return baseFormula;
  
  // Заменяем 1d20 на 2d20kh1 или 2d20kl1
  const keepType = mode === 'advantage' ? 'kh1' : 'kl1';
  return baseFormula.replace(/1d20/i, `2d20${keepType}`);
}

/**
 * Генерация формулы для Daggerheart (2d12 с позитивным/негативным)
 * @param {number} modifier 
 * @param {number} [hope=0] 
 * @param {number} [fear=0] 
 * @returns {string}
 */
export function buildDaggerheartFormula(modifier, hope = 0, fear = 0) {
  const hopeStr = hope > 0 ? `+${hope}` : '';
  const fearStr = fear > 0 ? `-${fear}` : '';
  return `2d12${hopeStr}${fearStr}+${modifier}`;
}

/**
 * Валидация формулы
 * @param {string} formula 
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFormula(formula) {
  try {
    parse(formula, { validate: true });
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Статистика по истории бросков
 * @param {RollResult[]} history 
 * @param {string} formula - Фильтр по формуле
 * @returns {Object}
 */
export function getRollStatistics(history, formula = null) {
  const filtered = formula 
    ? history.filter(r => r.formula === formula)
    : history;
  
  if (filtered.length === 0) {
    return { count: 0, average: 0, min: 0, max: 0, distribution: {} };
  }

  const totals = filtered.map(r => r.total);
  const sum = totals.reduce((a, b) => a + b, 0);
  
  // Распределение значений
  const distribution = {};
  for (const total of totals) {
    distribution[total] = (distribution[total] || 0) + 1;
  }

  return {
    count: filtered.length,
    average: sum / filtered.length,
    min: Math.min(...totals),
    max: Math.max(...totals),
    distribution,
    critSuccess: filtered.filter(r => r.hasCriticalSuccess).length,
    critFail: filtered.filter(r => r.hasCriticalFail).length
  };
}

// ============================================================================
// ЭКСПОРТ ДЛЯ УДОБСТВА
// ============================================================================

/**
 * Объект со всеми утилитами для импорта
 */
export const DiceUtils = {
  parse,
  parseRollPart,
  splitFormula,
  executeRoll,
  quickRoll,
  formatForUI,
  buildAdvantageFormula,
  buildDaggerheartFormula,
  validateFormula,
  getRollStatistics,
  SUPPORTED_DICE,
  PATTERNS,
  DiceRoll,
  RollResult
};

// Экспорт по умолчанию
export default DiceUtils;

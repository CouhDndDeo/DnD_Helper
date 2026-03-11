export class RandomTable {
  constructor(entries, { weights = null, allowDuplicates = false } = {}) {
    this.entries = entries;
    this.weights = weights;
    this.allowDuplicates = allowDuplicates;
    this.history = [];
  }

  roll({ count = 1, filter = null } = {}) {
    const results = [];
    const available = this.entries.filter(e => !filter || filter(e));
    
    for (let i = 0; i < count; i++) {
      let pool = available;
      
      // Исключаем уже выпавшие, если нужно
      if (!this.allowDuplicates) {
        pool = pool.filter(e => !this.history.includes(e));
      }
      
      if (pool.length === 0) break;
      
      const index = this._weightedRandom(pool);
      const result = pool[index];
      results.push(result);
      this.history.push(result);
    }
    
    return results;
  }

  _weightedRandom(pool) {
    if (!this.weights) {
      return Math.floor(Math.random() * pool.length);
    }
    
    // Логика взвешенного выбора...
    const totalWeight = pool.reduce((sum, _, i) => 
      sum + (this.weights[i] || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < pool.length; i++) {
      random -= (this.weights[i] || 1);
      if (random <= 0) return i;
    }
    return pool.length - 1;
  }
}

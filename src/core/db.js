const { Pool } = require('pg');
const config = require('../config/db');

class Database {
  constructor() {
    this.pool = new Pool({
      connectionString: config.dbUrl,
    });
  }

  async query(text, params) {
    return this.pool.query(text, params);
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();

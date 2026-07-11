require('dotenv').config();
const SystemScanner = require('./scanner');
const db = require('../src/core/db');

async function startAudit() {
  const scanner = new SystemScanner();
  
  try {
    const catalog = await scanner.init();
    await scanner.setupSession();
    await scanner.runAudit(catalog);
    scanner.generateFinalReport();
    await db.close();
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `FATAL ERROR: ${error.message}`);
    await db.close().catch(() => {});
    process.exit(1);
  }
}

startAudit();

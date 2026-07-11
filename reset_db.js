require('dotenv').config({ path: 'infrastructure-engine/.env' });
const db = require('./src/core/db');

async function reset() {
  try {
    console.log('🧹 Reseteando base de datos (DROP SCHEMA public CASCADE)...');
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
    await db.query('GRANT ALL ON SCHEMA public TO public');
    console.log('✅ Base de datos reseteada exitosamente.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error reseteando DB:', error);
    process.exit(1);
  }
}

reset();

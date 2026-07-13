require('dotenv').config();
const { Client } = require('pg');

async function sync() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Sincronizando roles...');

    // 1. Asegurar que los roles correctos existen
    const roles = ['DUEÑO', 'EMPLEADO', 'ADMINISTRADOR', 'SUPER_ADMIN'];
    for (const role of roles) {
      await client.query('INSERT INTO roles (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING', [
        role,
      ]);
    }

    // 2. Mapear roles antiguos a nuevos
    // CLIENT_ADMIN (old) -> DUEÑO (new)
    await client.query(`
      UPDATE usuarios
      SET role_id = (SELECT id FROM roles WHERE nombre = 'DUEÑO')
      WHERE role_id = (SELECT id FROM roles WHERE nombre = 'CLIENT_ADMIN')
    `);

    // USER (old) -> EMPLEADO (new)
    await client.query(`
      UPDATE usuarios
      SET role_id = (SELECT id FROM roles WHERE nombre = 'EMPLEADO')
      WHERE role_id = (SELECT id FROM roles WHERE nombre = 'USER')
    `);

    console.log('✅ Roles sincronizados exitosamente.');
  } catch (e) {
    console.error('❌ Error sincronizando roles:', e);
  } finally {
    await client.end();
  }
}

sync();

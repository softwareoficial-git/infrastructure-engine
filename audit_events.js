require('dotenv').config();
const db = require('./src/core/db');

async function runAudit() {
  try {
    console.log('--- 📊 INFRASTRUCTURE ENGINE: GLOBAL EVENT AUDIT ---\n');

    // 1. Totals
    const totals = await db.query(`
      SELECT
        count(*) as total,
        count(*) FILTER (WHERE status = 'SUCCESS') as success,
        count(*) FILTER (WHERE status = 'ERROR') as errors
      FROM system_events
    `);
    const { total, success, errors } = totals.rows[0];
    console.log(`Total Eventos: ${total}`);
    console.log(`✅ Exitosos: ${success} (${((success / total) * 100 || 0).toFixed(2)}%)`);
    console.log(`❌ Errores: ${errors} (${((errors / total) * 100 || 0).toFixed(2)}%)
`);

    // 2. Most Used Command
    const mostUsed = await db.query(`
      SELECT command, count(*) as count
      FROM system_events
      GROUP BY command
      ORDER BY count DESC LIMIT 1
    `);
    if (mostUsed.rows.length > 0) {
      console.log(
        `🚀 Comando más usado: ${mostUsed.rows[0].command} (${mostUsed.rows[0].count} veces)`
      );
    }

    // 3. Command with Most Errors
    const mostErrors = await db.query(`
      SELECT command, count(*) as count
      FROM system_events
      WHERE status = 'ERROR'
      GROUP BY command
      ORDER BY count DESC LIMIT 1
    `);
    if (mostErrors.rows.length > 0) {
      console.log(
        `⚠️ Comando con más errores: ${mostErrors.rows[0].command} (${mostErrors.rows[0].count} errores)`
      );
    } else {
      console.log(`⚠️ No se encontraron errores registrados.`);
    }

    console.log('\n--- 📜 ÚLTIMOS EVENTOS (Detalle) ---');
    const recent = await db.query(`
      SELECT
        e.created_at,
        e.command,
        e.status,
        e.error_code,
        u.username as usuario,
        c.nombre as cliente
      FROM system_events e
      LEFT JOIN usuarios u ON e.user_id = u.id
      LEFT JOIN clientes c ON e.tenant_id = c.id
      ORDER BY e.created_at DESC
      LIMIT 20
    `);

    console.table(
      recent.rows.map((r) => ({
        Fecha: r.created_at,
        Comando: r.command,
        Estado: r.status === 'SUCCESS' ? '✅' : '❌',
        Error: r.error_code || '-',
        Usuario: r.usuario || 'Sist.',
        Cliente: r.cliente || 'Global',
      }))
    );
  } catch (err) {
    console.error('Error during audit:', err);
  } finally {
    await db.close();
  }
}

runAudit();

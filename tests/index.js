const motor = require('./src/core/motor');
require('./src/domains/system');
require('./src/domains/system_config');
require('./src/domains/app');
require('./src/domains/client');
require('./src/domains/user');
const db = require('./src/core/db');

async function run() {
  try {
    const adminToken = 'ADMIN_SECRET_TOKEN_2026';

    console.log('--- 1. Prueba de Configuración Global (SYSTEM) ---');
    await motor.execute(adminToken, 'SYSTEM:set-global-config', {
      key: 'version_motor',
      value: { version: '1.0.0', maintenance: false },
    });
    const config = await motor.execute(adminToken, 'SYSTEM:get-global-config', {
      key: 'version_motor',
    });
    console.log('Configuración global recuperada:', config.value);

    console.log('--- 2. Prueba de Validación de Esquema (APP) ---');
    try {
      await motor.execute(adminToken, 'APP:template-create', {
        nombre: 'Plantilla Rota',
        contenido: { mal_formato: 123 }, // Debería fallar por falta de stock/precios
      });
    } catch (e) {
      console.log('Éxito: Plantilla rechazada por esquema inválido:', e.message);
    }

    console.log('--- 3. Prueba de Migración Global (APP) ---');
    // Primero creamos un cliente con la plantilla válida
    const t = await motor.execute(adminToken, 'APP:template-create', {
      nombre: 'Retail v1',
      contenido: { stock: [], precios: {} },
    });
    await motor.execute(adminToken, 'APP:template-publish', { templateId: t.template.id });
    const c = await motor.execute(adminToken, 'APP:client-create', { nombre: 'Tienda Test' });
    const clienteId = c.cliente.id;

    console.log(
      'Estado inicial del cliente:',
      (await motor.execute(adminToken, 'USER:read', { clienteId })).data
    );

    await motor.execute(adminToken, 'APP:migrate-global', {
      targetVersion: 2,
      transformation: { add_field: 'descuento', default: 0 },
    });
    console.log(
      'Estado tras migración global:',
      (await motor.execute(adminToken, 'USER:read', { clienteId })).data
    );
  } catch (error) {
    console.error('Error en el flujo final:', error.message);
  } finally {
    await db.close();
  }
}

run();

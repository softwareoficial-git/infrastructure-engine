require('dotenv').config();
const db = require('./src/core/db');

async function setup() {
  try {
    console.log('🛠️  Configurando entorno de auditoría...');
    
    // 1. Limpiar plantillas oficiales previas
    await db.query('UPDATE plantillas SET es_oficial = false');
    
    // 2. Crear e insertar una plantilla oficial básica
    const templateContent = {
      stock: [],
      precios: {},
      categorias: []
    };
    
    const result = await db.query(
      'INSERT INTO plantillas (nombre, contenido, es_oficial) VALUES ($1, $2, $3) RETURNING id',
      ['Plantilla Oficial de Auditoría', templateContent, true]
    );
    
    console.log(`✅ Plantilla oficial creada y publicada con ID: ${result.rows[0].id}`);
    console.log('🚀 El sistema ya puede crear clientes.');
  } catch (error) {
    console.error('❌ Error configurando el entorno:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

setup();

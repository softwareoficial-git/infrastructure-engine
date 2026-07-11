const path = require('path');
require('dotenv').config();
const { spawn } = require('child_process');
const axios = require('axios');
const SystemScanner = require('./audits/scanner');
const db = require('./src/core/db');

async function startFullProcess() {
  console.log('🚀 Iniciando Orquestación Final de Auditoría...');
  
  // 1. Iniciar Servidor
  console.log('📡 Levantando servidor en http://localhost:3001...');
  const serverPath = path.join(__dirname, 'src', 'server.js');
  console.log(`[DEBUG] Server path: ${serverPath}`);
  const server = spawn('node', [serverPath], {
    stdio: 'inherit',
    cwd: __dirname
  });

  // 2. Esperar a que el servidor responda al /health
  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 10) {
    attempts++;
    try {
      await axios.get('http://localhost:3001/health');
      isReady = true;
      console.log('✅ Servidor listo y saludable.');
    } catch (e) {
      console.log(`⏳ Esperando servidor... (Intento ${attempts}/10)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!isReady) {
    console.error('❌ El servidor no respondió a tiempo. Abortando.');
    server.kill();
    process.exit(1);
  }

  try {
    // 3. Ejecutar Auditoría
    const scanner = new SystemScanner();
    const catalog = await scanner.init();
    await scanner.setupSession();
    await scanner.runAudit(catalog);
    scanner.generateFinalReport();
    
    console.log('\n✅ Auditoría completada exitosamente.');
  } catch (error) {
    console.error('\n❌ Error durante la auditoría:', error.message);
  } finally {
    // 4. Limpieza
    console.log('\n🧹 Cerrando servidor y base de datos...');
    server.kill('SIGKILL');
    await db.close().catch(() => {});
    console.log('🏁 Proceso finalizado.');
  }
}

startFullProcess();

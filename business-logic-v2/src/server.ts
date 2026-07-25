import 'dotenv/config';
import http from 'http';
import app from './app';
import { dispatcher } from './core/Dispatcher';
import { staffModule } from './modules/staff';
import { stockModule } from './modules/stock';
import { salesModule } from './modules/sales';
import { billingModule } from './modules/billing';
import { systemModule } from './modules/system';
import { businessModule } from './modules/business';
import { crmModule } from './modules/crm';
import { operationsModule } from './modules/operations';
import { registrationModule } from './modules/registration';
import { importModule } from './modules/import';
import { paymentsModule } from './modules/payments';
import { automationModule } from './modules/automation';


async function bootstrap() {
  try {
    console.log('🚀 Starting Business Logic Engine V2...');

    // Importar módulos para registrar sus comandos en el dispatcher
    // El simple hecho de importar la instancia ejecuta el constructor y registra los comandos
    console.log('📦 Loading modules...');
    staffModule;
    stockModule;
    salesModule;
    billingModule;
    systemModule;
    businessModule;
    crmModule;
    operationsModule;
    registrationModule;
    importModule;
    paymentsModule;
    automationModule;

    const port = parseInt(process.env.PORT || '9002', 10);


    const server = http.createServer(app);

    server.listen(port, '0.0.0.0', () => {
      console.log(`✅ V2 Server running on http://0.0.0.0:${port}`);
      console.log(`🛠️  Core: InfraClient + Dispatcher + RBAC Active`);
      console.log(`💳 Billing Guard: Enabled`);
    });
  } catch (error) {
    console.error('❌ Critical failure during bootstrap:', error);
    process.exit(1);
  }
}

bootstrap();

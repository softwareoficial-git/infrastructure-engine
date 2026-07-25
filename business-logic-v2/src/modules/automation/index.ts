import cron from 'node-cron';
import { db } from '../../core/db';

export class AutomationModule {
  constructor() {
    this.initCron();
  }

  private initCron() {
    // Correr diariamente a medianoche
    cron.schedule('0 0 * * *', async () => {
      console.log('⏰ Running subscription maintenance cron...');
      await this.checkSubscriptions();
    });
  }

  private async checkSubscriptions() {
    // Obtener todos los clientes que tienen un plan pro y una fecha de pago
    const result = await db.query(`
      SELECT id, private_config 
      FROM clientes 
      WHERE private_config->>'plan' = 'pro'
    `);

    for (const row of result.rows) {
      const pc = row.private_config;
      if (!pc.last_payment_date) continue;

      const now = new Date();
      const startDate = new Date(pc.last_payment_date);
      const months = pc.meses_contratados || 1;
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
      
      const daysRemaining = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let status = 'active';
      if (daysRemaining <= 0) status = 'expired';
      else if (daysRemaining <= 7) status = 'warning';

      // Actualizar el estado en private_config si ha cambiado
      if (pc.status !== status) {
        await db.query(
          "UPDATE clientes SET private_config = private_config || $2::jsonb WHERE id = $1",
          [row.id, JSON.stringify({ status })]
        );
      }
    }
    console.log('✅ Subscription maintenance completed.');
  }
}

export const automationModule = new AutomationModule();

import { dispatcher } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';
import { PaymentFactory } from './PaymentFactory';

class PaymentsModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Iniciar suscripción mediante pasarela
    dispatcher.register('payments.create', {
      name: 'payments.create',
      description: 'Inicia el proceso de suscripción con una pasarela',
      requiredRole: 'DUEÑO'
    }, this.createSubscription);

    // Webhook para recibir notificaciones
    dispatcher.register('payments.webhook', {
      name: 'payments.webhook',
      description: 'Recibe notificaciones de la pasarela de pago',
      requiredRole: 'SISTEMA_ADMIN' // Backend only
    }, this.handleWebhook);
  }

  private async createSubscription(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { gateway, clienteId, plan, months } = params;
    const g = PaymentFactory.getGateway(gateway);
    return await g.createSubscription(clienteId, plan, months);
  }

  private async handleWebhook(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { gateway, payload } = params;
    const g = PaymentFactory.getGateway(gateway);
    return await g.handleWebhook(payload);
  }
}

export const paymentsModule = new PaymentsModule();

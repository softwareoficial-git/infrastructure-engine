import { dispatcher } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class BillingModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Inicializar Suscripción (Trial)
    dispatcher.register('billing.init', {
      name: 'billing.init',
      description: 'Inicializa el periodo de prueba o suscripción para el cliente',
      requiredRole: 'SISTEMA_ADMIN'
    }, this.initSubscription);

    // Extender Suscripción
    dispatcher.register('billing.extend', {
      name: 'billing.extend',
      description: 'Añade días adicionales a la suscripción actual',
      requiredRole: 'SISTEMA_ADMIN'
    }, this.extendSubscription);

    // Consultar Estado de Cuenta
    dispatcher.register('billing.status', {
      name: 'billing.status',
      description: 'Obtiene la fecha de expiración y estado del plan',
      requiredRole: 'DUEÑO'
    }, this.getStatus);
  }

  private async initSubscription(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { clienteId, days = 30, plan = 'basic' } = params;
    if (!clienteId) return { success: false, message: 'clienteId es requerido' };

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(startDate.getDate() + days);

    const subscriptionData = {
      status: 'active',
      start_date: startDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      cycle_days: days,
      plan: plan
    };

    // Guardamos en private_config para que el cliente no pueda modificarlo vía USER:update-path
    return infraClient.updatePath(clienteId, 'private_config.subscription', subscriptionData, context.token);
  }

  private async extendSubscription(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { clienteId, addDays } = params;
    if (!clienteId || !addDays) return { success: false, message: 'clienteId y addDays son requeridos' };

    const res = await infraClient.readPath<any>(clienteId, 'private_config.subscription', context.token);
    if (!res.success) return res;

    const sub = res.data;
    if (!sub || !sub.expiry_date) {
      return { success: false, message: 'No se encontró una suscripción activa para extender' };
    }

    const currentExpiry = new Date(sub.expiry_date);
    currentExpiry.setDate(currentExpiry.getDate() + addDays);

    return infraClient.updatePath(clienteId, 'private_config.subscription', {
      ...sub,
      expiry_date: currentExpiry.toISOString()
    }, context.token);
  }

  private async getStatus(context: RequestContext, params: any): Promise<ServiceResponse> {
    return infraClient.readPath(context.tenantId, 'private_config.subscription', context.token);
  }
}

export const billingModule = new BillingModule();

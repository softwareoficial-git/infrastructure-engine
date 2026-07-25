import { dispatcher, CommandHandler } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class CRMModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Crear Cliente
    dispatcher.register('customer.create', {
      name: 'customer.create',
      description: 'Registra un nuevo cliente en la base de datos del negocio',
      requiredRole: 'EMPLEADO',
      requiredPlan: 'free'
    }, this.createCustomer);

    // Listar Clientes
    dispatcher.register('customer.list', {
      name: 'customer.list',
      description: 'Obtiene la lista de clientes con filtrado básico',
      requiredRole: 'EMPLEADO',
      requiredPlan: 'free'
    }, this.listCustomers);

    // Historial del Cliente
    dispatcher.register('customer.get_history', {
      name: 'customer.get_history',
      description: 'Obtiene todas las interacciones y compras de un cliente específico',
      requiredRole: 'EMPLEADO',
      requiredPlan: 'free'
    }, this.getCustomerHistory);
  }

  private async createCustomer(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      const { name, phone, email, address } = params;
      if (!name || !phone) {
        return { success: false, message: 'Nombre y teléfono son requeridos' };
      }

      const customer = {
        id: `CUST-${Date.now()}`,
        name,
        phone,
        email,
        address,
        createdAt: new Date().toISOString(),
        tenantId: context.tenantId
      };

      return infraClient.pushItem(context.tenantId, 'customers', customer, context.token);
    } catch (e: any) {
      return { success: false, message: e.message || 'Error creando cliente' };
    }
  }

  private async listCustomers(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      return await infraClient.readPath<any[]>(context.tenantId, 'customers', context.token);
    } catch (e: any) {
      return { success: false, message: e.message || 'Error listando clientes' };
    }
  }

  private async getCustomerHistory(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      const { customerId } = params;
      if (!customerId) return { success: false, message: 'customerId es requerido' };

      // 1. Validar que el cliente pertenece al tenant actual
      const customerCheck = await infraClient.readPath<any>(context.tenantId, `customers/${customerId}`, context.token);
      if (!customerCheck.success || !customerCheck.data) {
        return { success: false, message: 'Cliente no encontrado o acceso denegado' };
      }

      // Buscamos todas las ventas donde el clienteId coincida
      const sales = await infraClient.queryJson<any>(context.tenantId, 'sales.history', { customerId }, context.token);
      
      return { 
        success: true, 
        message: 'Historial obtenido', 
        data: sales.data || [] 
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error obteniendo historial' };
    }
  }
}

export const crmModule = new CRMModule();

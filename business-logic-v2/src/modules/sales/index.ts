import { dispatcher } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class SalesModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Procesar Venta (Checkout)
    dispatcher.register('sales.checkout', {
      name: 'sales.checkout',
      description: 'Procesa una venta: valida stock, descuenta y registra venta',
      requiredRole: 'EMPLEADO'
    }, this.checkout);

    // Crear Orden de Venta y Link de Pago
    dispatcher.register('sales.create', {
      name: 'sales.create',
      description: 'Crea una orden de venta y genera un link de pago',
      requiredRole: 'EMPLEADO'
    }, this.createOrder);

    // Confirmar Pago
    dispatcher.register('sales.confirm_payment', {
      name: 'sales.confirm_payment',
      description: 'Confirma el pago de una orden y descuenta el stock',
      requiredRole: 'EMPLEADO'
    }, this.confirmPayment);

    // Historial de Ventas
    dispatcher.register('sales.history', {
      name: 'sales.history',
      description: 'Obtiene el historial de ventas de la empresa',
      requiredRole: 'DUEÑO'
    }, this.getHistory);

    // Resumen Consolidado de Ventas
    dispatcher.register('sales.summary', {
      name: 'sales.summary',
      description: 'Obtiene el resumen consolidado de ventas por vendedor',
      requiredRole: 'DUEÑO'
    }, this.getSummary);
  }

  private async checkout(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { items, customerId, clientTimestamp, client_request_id, ticket } = params;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, message: 'La lista de items es requerida' };
    }

    // 1. Leer Stock
    const stockRes = await infraClient.readPath<any[]>(context.tenantId, 'stock', context.token);
    if (!stockRes.success) return stockRes;
    const stock = stockRes.data || [];

    // 2. Validar Stock y preparar venta
    const soldItems = [];
    let totalSale = 0;

    for (const item of items) {
      const index = stock.findIndex(p => p.code === item.code);
      if (index === -1) {
        console.log(`[DEBUG] Producto no encontrado:`, item.code);
        return { success: false, message: `Producto ${item.code} no encontrado` };
      }

      const product = stock[index];
      if (product.qty < item.qty) {
        console.log(`[DEBUG] Stock insuficiente para:`, product.name, 'Necesita:', item.qty, 'Tiene:', product.qty);
        return { success: false, message: `Stock insuficiente para ${product.name}` };
      }

      soldItems.push({ product_code: product.code, name: product.name, qty: item.qty, price: product.price });
      totalSale += (product.price * item.qty);
    }

    // 3. Ejecutar actualizaciones
    for (const item of items) {
      const index = stock.findIndex(p => p.code === item.code);
      const product = stock[index];
      const updatedProduct = { ...product, qty: product.qty - item.qty };
      const updateRes = await infraClient.updatePath(context.tenantId, `stock.${index}`, updatedProduct, context.token);
      if (!updateRes.success) return updateRes;
    }

    // 4. Crear registro de venta (usando ticket si viene del front, o generando uno)
    const saleId = `ORD-${Date.now()}`;
    const saleRecord = {
      id: saleId,
      total: totalSale,
      items: soldItems,
      customerId,
      createdAt: clientTimestamp || new Date().toISOString(),
      ticket: ticket || { items: soldItems, total_ticket: totalSale } // Persistimos el ticket
    };
    
    await infraClient.pushItem(context.tenantId, 'sales_orders', saleRecord, context.token);

    // 5. Emitir evento único de auditoría
    await infraClient.execute('SYSTEM:log-event', {
      status: 'SUCCESS',
      command: 'sales.checkout-consolidated',
      tenantId: context.tenantId,
      userId: context.userId,
      details: {
        fecha: saleRecord.createdAt,
        resumen: `Venta: Total $${totalSale}`,
        detalle: { 
          total: totalSale, 
          ticket: saleRecord.ticket, 
          client_request_id 
        }
      }
    }, context.token);

    return { 
      success: true, 
      message: 'Venta procesada.', 
      data: { sale_id: saleId, total: totalSale } 
    };
  }

  private async createOrder(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { items, total, account_alias, client_request_id, clientTimestamp } = params;

    // 1. Idempotency Check
    if (client_request_id) {
      const res = await infraClient.queryJson<any>(context.tenantId, 'sales_orders', { client_request_id }, context.token);
      if (res.success && res.data && res.data.length > 0) {
        return { success: true, message: 'Sale already registered.', data: { sale_id: res.data[0].id } };
      }
    }

    // 2. Sales Order
    const saleId = `ORD-${Date.now()}`;
    const saleRecord = {
      id: saleId,
      total,
      payment_status: 'pending',
      client_request_id,
      createdAt: clientTimestamp || new Date().toISOString()
    };

    const saleRes = await infraClient.pushItem(context.tenantId, 'sales_orders', saleRecord, context.token);
    if (!saleRes.success) return saleRes;

    // 3. Items (Stored as a separate list)
    if (Array.isArray(items)) {
      const orderItems = items.map((item: any) => ({
        sale_id: saleId,
        product_code: item.code,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity
      }));

      for (const item of orderItems) {
        await infraClient.pushItem(context.tenantId, 'sale_items', item, context.token);
      }
    }

    // 4. Mock Payment Link
    const paymentLink = `https://api.payments.com/pay/${saleId}`;

    // 5. Actualización Quirúrgica del Link de Pago
    // Ya no leemos todo el array de órdenes, buscamos la posición y actualizamos solo el campo.
    const ordersRes = await infraClient.readPath<any[]>(context.tenantId, 'sales_orders', context.token);
    if (ordersRes.success && Array.isArray(ordersRes.data)) {
      const orders = ordersRes.data;
      const idx = orders.findIndex(o => o.id === saleId);
      if (idx !== -1) {
        await infraClient.updatePath(context.tenantId, `sales_orders[${idx}].payment_link`, paymentLink, context.token);
      }
    }

    return {
      success: true,
      message: 'Sale created successfully.',
      data: { payment_link: paymentLink, sale_id: saleId }
    };
  }

  private async confirmPayment(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { sale_id } = params;
    if (!sale_id) return { success: false, message: 'sale_id is required' };

    return infraClient.execute('CONFIRM_SALE_PAYMENT', {
      sale_id,
      user_id: context.userId,
      tenantId: context.tenantId
    }, context.token);
  }

  private async getSummary(context: RequestContext, params: any): Promise<ServiceResponse> {
    const ordersRes = await infraClient.readPath<any[]>(context.tenantId, 'sales_orders', context.token);
    const itemsRes = await infraClient.readPath<any[]>(context.tenantId, 'sale_items', context.token);

    if (!ordersRes.success) return ordersRes;
    if (!itemsRes.success && itemsRes.error?.code !== 'PATH_NOT_FOUND') return itemsRes;

    const orders = ordersRes.data || [];
    const items = itemsRes.data || [];

    const summary: any = {
      total_ventas_24h: 0,
      detalle_por_empleado: {}
    };

    orders.forEach(order => {
      const orderItems = items.filter((i: any) => i.sale_id === order.id);
      
      // Asumimos que el empleado está registrado en la orden
      const empleado = order.empleado || 'Desconocido';

      if (!summary.detalle_por_empleado[empleado]) {
        summary.detalle_por_empleado[empleado] = {
          productos: [],
          total_empleado: 0
        };
      }

      orderItems.forEach((item: any) => {
        summary.detalle_por_empleado[empleado].productos.push({
          producto: item.product_code,
          cantidad: item.quantity,
          monto: item.subtotal
        });
        summary.detalle_por_empleado[empleado].total_empleado += item.subtotal;
        summary.total_ventas_24h += item.subtotal;
      });
    });

    return { success: true, message: 'Resumen obtenido correctamente', data: { summary } };
  }

  private async getHistory(context: RequestContext, params: any): Promise<ServiceResponse> {
    const res = await infraClient.readPath(context.tenantId, 'sales.history', context.token);
    if (!res.success && res.error?.code === 'PATH_NOT_FOUND') {
      return { success: true, message: 'No sales history found', data: [] };
    }
    return res;
  }

  private async getHistoryFixed(context: RequestContext, params: any): Promise<ServiceResponse> {
    return infraClient.readPath(context.tenantId, 'sales.history', context.token);
  }
}

export const salesModule = new SalesModule();


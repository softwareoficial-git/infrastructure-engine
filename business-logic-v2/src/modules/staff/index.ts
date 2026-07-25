import { dispatcher, CommandHandler } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class StaffModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Crear Empleado
    dispatcher.register('staff.create', {
      name: 'staff.create',
      description: 'Crea un nuevo empleado (Humano o Bot) vinculado a la empresa',
      requiredRole: 'DUEÑO'
    }, this.createEmployee);

    // Listar Empleados
    dispatcher.register('staff.list', {
      name: 'staff.list',
      description: 'Lista todos los empleados de la empresa',
      requiredRole: 'DUEÑO'
    }, this.listEmployees);

    // Definir Término de Negocio (Permiso, Meta, Tarea)
    dispatcher.register('staff.define_term', {
      name: 'staff.define_term',
      description: 'Define un término personalizado (tipo: permission, goal_type, task)',
      requiredRole: 'DUEÑO'
    }, this.defineTerm);

    // Asignar Meta de Rendimiento
    dispatcher.register('staff.set_goal', {
      name: 'staff.set_goal',
      description: 'Asigna una meta de rendimiento a un empleado',
      requiredRole: 'DUEÑO'
    }, this.setGoal);

    // Actualizar Permisos
    dispatcher.register('staff.update_permissions', {
      name: 'staff.update_permissions',
      description: 'Actualiza los permisos granulares de un empleado',
      requiredRole: 'DUEÑO'
    }, this.updatePermissions);

    // Eliminar Empleado
    dispatcher.register('staff.delete', {
      name: 'staff.delete',
      description: 'Elimina un empleado de la empresa',
      requiredRole: 'DUEÑO'
    }, this.deleteEmployee);

    // Monitoreo de Actividad
    dispatcher.register('staff.get_employee_activity', {
      name: 'staff.get_employee_activity',
      description: 'Consulta la línea de tiempo de actividades de un empleado',
      requiredRole: 'DUEÑO'
    }, this.getEmployeeActivity);
  }

  // ... (métodos existentes createEmployee, defineTerm, setGoal, listEmployees, updatePermissions, deleteEmployee)

  private async getEmployeeActivity(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { userId } = params;

    // 1. Si se solicita un usuario específico, consultar solo a él
    if (userId) {
      const res = await infraClient.execute('USER:audit-team', { userId, limit: 100 }, context.token);
      return res.success ? { success: true, message: 'Auditoría obtenida', data: res.data.timeline || [] } : res;
    }

    // 2. Si es global (sin userId), listar todos los empleados primero
    const employeesRes = await this.listEmployees(context, {});
    if (!employeesRes.success) return { success: false, message: 'No se pudieron listar los empleados para la auditoría.' };

    const employees = employeesRes.data?.usuario || employeesRes.data || [];
    const allTimeline: any[] = [];

    // 3. Consultar la actividad de cada empleado individualmente
    for (const emp of employees) {
      const res = await infraClient.execute('USER:audit-team', { userId: emp.id, limit: 50 }, context.token);
      if (res.success && res.data.timeline) {
        allTimeline.push(...res.data.timeline);
      }
    }

    // 4. Transformar y organizar los datos (mismo formato consolidado)
    const ventasConsolidadas: any = {};
    const otrosEventos: any[] = [];

    allTimeline.forEach((log: any) => {
      if (log.command === 'sales.checkout-consolidated') {
        const details = log.details || {};
        const saleId = details.detalle?.client_request_id || `ID_${Date.now()}`;
        
        ventasConsolidadas[saleId] = {
          fecha: details.fecha,
          comando: 'Venta realizada',
          estatus: log.status,
          resumen: details.resumen || 'Venta realizada',
          detalle: details.detalle
        };
        return;
      }

      if (['staff.create', 'stock.add', 'stock.update', 'stock.delete'].includes(log.command)) {
        otrosEventos.push({
          fecha: (typeof log.created_at === 'string' ? log.created_at : new Date().toISOString()),
          comando: log.command,
          estatus: log.status,
          resumen: log.resumen || 'Acción de negocio',
          detalle: log.payload || log.params
        });
      }
    });

    return {
      success: true,
      message: 'Auditoría organizada correctamente',
      data: [...Object.values(ventasConsolidadas), ...otrosEventos]
    };
  }

  private async createEmployee(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { nombre, role, username, password, type = 'human', userId, botProfileId } = params;
    if (!nombre || !role) {
      return { success: false, message: 'Faltan datos obligatorios: nombre y role' };
    }

    // 1. Crear el usuario en la infraestructura (Auth/System)
    const userRes = await infraClient.execute('CLIENT:user-create', {
      username: username || nombre.replace(/\\s+/g, '_').toLowerCase(),
      password: password || 'DefaultPassword123!', 
      role: role.toUpperCase(),
      clienteId: context.tenantId,
      type,
      user_id: userId,
      bot_profile_id: botProfileId
    }, context.token);

    if (!userRes.success) return userRes;
    const createdUser = userRes.data?.usuario || userRes.data;

    // 2. Registrar el empleado en la configuración del Tenant (Lógica de Negocio)
    await infraClient.pushItem(context.tenantId, 'employees', {
      id: createdUser.id,
      username: createdUser.username,
      name: nombre,
      role,
      type,
      joinedAt: new Date().toISOString()
    }, context.token);

    return userRes;
  }

  private async defineTerm(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { def_type, def_key, def_label } = params;
    const typeMap: Record<string, string> = {
      'permission': 'business_definitions.permissions',
      'goal_type': 'business_definitions.goal_types',
      'task': 'business_definitions.tasks'
    };

    const path = typeMap[def_type];
    if (!path) {
      return { success: false, message: "Tipo inválido. Debe ser 'permission', 'goal_type' o 'task'." };
    }

    return infraClient.pushItem(context.tenantId, path, {
      def_key,
      def_label
    }, context.token);
  }

  private async setGoal(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { employeeId, goalType, target, startDate, endDate } = params;
    if (!employeeId || !goalType || !target) {
      return { success: false, message: 'employeeId, goalType y target son requeridos' };
    }

    // Read-Modify-Write pattern for employees array
    const res = await infraClient.readPath<any[]>(context.tenantId, 'employees', context.token);
    if (!res.success) return res;

    const employees = res.data || [];
    const empIndex = employees.findIndex(e => e.id === employeeId || e.username === employeeId);
    
    if (empIndex === -1) return { success: false, message: 'Empleado no encontrado' };

    const emp = employees[empIndex];
    if (!emp.goals) emp.goals = {};
    emp.goals[goalType] = { target, startDate, endDate };

    return infraClient.updatePath(
      context.tenantId, 
      'employees', 
      employees, 
      context.token
    );
  }

  private listEmployees = async (context: RequestContext, params: any): Promise<ServiceResponse> => {
    return infraClient.execute('CLIENT:user-list', {
      clienteId: context.tenantId
    }, context.token);
  }

  private async updatePermissions(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { userId, permissions } = params;
    if (!userId || !Array.isArray(permissions)) {
      return { success: false, message: 'userId y un array de permissions son requeridos' };
    }

    return infraClient.execute('CLIENT:user-permissions-update', {
      userId,
      clienteId: context.tenantId,
      permissions
    }, context.token);
  }

  private async deleteEmployee(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { userId } = params;
    if (!userId) {
      return { success: false, message: 'userId es requerido' };
    }

    // 1. Eliminar usuario en Infraestructura (Auth/System)
    const userRes = await infraClient.execute('CLIENT:user-delete', {
      userId: userId,
      clienteId: context.tenantId
    }, context.token);

    if (!userRes.success) return userRes;

    // 2. Leer empleados actuales
    const res = await infraClient.readPath<any[]>(context.tenantId, 'employees', context.token);
    if (!res.success) return res;

    const employees = res.data || [];
    // 3. Filtrar el empleado
    const updatedEmployees = employees.filter(e => e.id !== userId);

    // 4. Guardar array completo
    return infraClient.updatePath(context.tenantId, 'employees', updatedEmployees, context.token);
  }
}

export const staffModule = new StaffModule();

import { dispatcher, CommandHandler } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class OperationsModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Asignar Tarea
    dispatcher.register('staff.assign_task', {
      name: 'staff.assign_task',
      description: 'Asigna una tarea definida al personal',
      requiredRole: 'DUEÑO',
      requiredPlan: 'free'
    }, this.assignTask);

    // Completar Tarea
    dispatcher.register('staff.complete_task', {
      name: 'staff.complete_task',
      description: 'Marca una tarea como completada',
      requiredRole: 'EMPLEADO',
      requiredPlan: 'free'
    }, this.completeTask);

    // Listar Tareas Pendientes
    dispatcher.register('staff.get_pending_tasks', {
      name: 'staff.get_pending_tasks',
      description: 'Obtiene las tareas pendientes para el usuario actual',
      requiredRole: 'EMPLEADO',
      requiredPlan: 'free'
    }, this.getPendingTasks);
  }

  private async assignTask(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      const { employeeId, taskKey, deadline } = params;
      if (!employeeId || !taskKey) {
        return { success: false, message: 'employeeId y taskKey son requeridos' };
      }

      const task = {
        id: `TASK-${Date.now()}`,
        employeeId,
        taskKey,
        status: 'pending',
        assignedAt: new Date().toISOString(),
        deadline,
        tenantId: context.tenantId
      };

      return infraClient.pushItem(context.tenantId, 'tasks', task, context.token);
    } catch (e: any) {
      return { success: false, message: e.message || 'Error asignando tarea' };
    }
  }

  private async completeTask(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      const { taskId } = params;
      if (!taskId) return { success: false, message: 'taskId es requerido' };

      // Buscamos la tarea para obtener su índice
      const tasksRes = await infraClient.readPath<any[]>(context.tenantId, 'tasks', context.token);
      if (!tasksRes.success) return tasksRes;

      const tasks = tasksRes.data || [];
      const index = tasks.findIndex(t => t.id === taskId);
      if (index === -1) return { success: false, message: 'Tarea no encontrada' };

      // Actualización quirúrgica del estado
      return infraClient.updatePath(context.tenantId, `tasks[${index}].status`, 'completed', context.token);
    } catch (e: any) {
      return { success: false, message: e.message || 'Error completando tarea' };
    }
  }

  private async getPendingTasks(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      const tasks = await infraClient.queryJson<any>(context.tenantId, 'tasks', { 
        employeeId: context.userId, 
        status: 'pending' 
      }, context.token);

      return { 
        success: true, 
        message: 'Tareas obtenidas', 
        data: tasks.data || [] 
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error obteniendo tareas' };
    }
  }
}

export const operationsModule = new OperationsModule();

import { dispatcher, CommandHandler } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class BusinessModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    // Definir un Término de Negocio (Rol, Meta, Tarea)
    dispatcher.register('business.define_term', {
      name: 'business.define_term',
      description: 'Define un término personalizado (tipo: permission, goal_type, task) para el negocio',
      requiredRole: 'DUEÑO',
      requiredPlan: 'free'
    }, this.defineTerm);

    // Obtener Configuración Global del Negocio
    dispatcher.register('business.get_config', {
      name: 'business.get_config',
      description: 'Obtiene toda la configuración y definiciones del negocio',
      requiredRole: 'EMPLEADO',
      requiredPlan: 'free'
    }, this.getConfig);

    // Historial de Actividad del Negocio
    dispatcher.register('business.activity_logs', {
      name: 'business.activity_logs',
      description: 'Obtiene la bitácora de cambios y acciones realizadas dentro del negocio',
      requiredRole: 'DUEÑO',
      requiredPlan: 'free'
    }, this.getActivityLogs);
  }

  private async getActivityLogs(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      // Consultamos los eventos registrados específicamente para este tenant
      const logs = await infraClient.queryJson<any>(context.tenantId, 'system_events', { 
        tenantId: context.tenantId 
      }, context.token);

      return { 
        success: true, 
        message: 'Logs de actividad obtenidos', 
        data: logs.data || [] 
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error obteniendo logs de actividad' };
    }
  }

  private async defineTerm(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      const { def_type, def_key, def_label } = params;

      // Validación Estricta: Solo permitimos tipos predefinidos para mantener la integridad de la API
      const validTypes = ['permission', 'goal_type', 'task'];
      if (!def_type || !validTypes.includes(def_type)) {
        return { 
          success: false, 
          message: `Tipo inválido. Debe ser uno de: ${validTypes.join(', ')}`,
          error: { code: 'INVALID_TYPE', message: 'El tipo de término no es válido' }
        };
      }

      if (!def_key || !def_label) {
        return { 
          success: false, 
          message: 'def_key y def_label son requeridos',
          error: { code: 'MISSING_PARAMS', message: 'Faltan parámetros obligatorios' }
        };
      }

      // Mapeo de rutas para el blindaje de Infra
      const routeMap: Record<string, string> = {
        'permission': 'business_definitions.permissions',
        'goal_type': 'business_definitions.goal_types',
        'task': 'business_definitions.tasks'
      };

      const path = routeMap[def_type];

      // Ejecución Atómica: Usamos pushItem para evitar colisiones y asegurar la carga masiva
      const res = await infraClient.pushItem(context.tenantId, path, {
        def_key,
        def_label,
        createdAt: new Date().toISOString(),
        createdBy: context.userId
      }, context.token);

      if (!res.success) return res;

      return { 
        success: true, 
        message: `Término ${def_label} (${def_type}) definido exitosamente.` 
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error definiendo término' };
    }
  }

  private async getConfig(context: RequestContext, params: any): Promise<ServiceResponse> {
    try {
      // Leemos la configuración completa del negocio
      const res = await infraClient.readPath<any>(context.tenantId, 'business_definitions', context.token);
      
      if (!res.success) return res;

      return { 
        success: true, 
        message: 'Configuración obtenida exitosamente', 
        data: res.data 
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Error obteniendo configuración' };
    }
  }
}

export const businessModule = new BusinessModule();

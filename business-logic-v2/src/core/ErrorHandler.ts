export enum ErrorSource {
  INFRASTRUCTURE = "INFRASTRUCTURE",
  VALIDATION = "VALIDATION",
  BUSINESS_RULE = "BUSINESS_RULE",
  AUTH = "AUTH",
  INTERNAL = "INTERNAL",
}

export interface AppError {
  message: string;
  code: string;
  source: ErrorSource;
  statusCode: number;
  details?: any;
}

export class ErrorHandler {
  private static USER_MESSAGES: Record<string, string> = {
    PLAN_EXPIRED:
      "Tu suscripción ha expirado. Causa: La fecha de vigencia de tu plan ha sido superada. Solución: Por favor, contacta con soporte o accede al panel de facturación para renovar tu plan y recuperar el acceso.",
    INVALID_PATH_TYPE:
      "Error de formato de datos. Causa: El sistema esperaba un tipo de dato diferente en la ruta solicitada. Solución: Verifica que la información guardada sea correcta o contacta al equipo técnico para corregir la estructura del dato.",
    INFRA_ERROR:
      "Fallo de comunicación con la base de datos. Causa: Hubo un problema técnico al intentar leer o escribir datos en la infraestructura. Solución: Verifica tu conexión a internet y reintenta la operación en unos segundos. Si el problema persiste, informa al administrador.",
    INFRA_EXECUTION_ERROR:
      "Error en la ejecución del motor. Causa: El servidor de infraestructura encontró un problema al procesar la lógica del comando. Solución: Revisa que los parámetros enviados sean correctos y vuelve a intentarlo. Si el error persiste, es posible que sea un bug interno.",
    INFRA_CONNECTION_ERROR:
      "Servidor de infraestructura no disponible. Causa: No se pudo establecer una conexión con el API de datos (timeout o servidor caído). Solución: Verifica que el servidor de infraestructura esté encendido y que no haya bloqueos de red o firewall.",
    AUTH_FAILED:
      "Sesión no válida o expirada. Causa: Tu token de acceso ya no es reconocido por el sistema. Solución: Por favor, cierra sesión e inicia sesión nuevamente para generar un nuevo token de acceso.",
    VALIDATION_ERROR:
      "Datos de entrada no válidos. Causa: Uno o más campos enviados no cumplen con los requisitos obligatorios o el formato esperado. Solución: Revisa los mensajes de error en los campos del formulario y asegúrate de completar toda la información requerida.",
    INSUFFICIENT_STOCK:
      "Stock insuficiente. Causa: La cantidad solicitada supera las existencias actuales en el inventario. Solución: Verifica la disponibilidad del producto en el módulo de Stock o ajusta la cantidad en tu pedido antes de confirmar la venta.",
    USER_NOT_FOUND:
      "Usuario no encontrado. Causa: El ID o nombre de usuario proporcionado no existe en nuestra base de datos. Solución: Verifica que hayas escrito correctamente los datos del usuario o intenta buscarlo nuevamente.",
    PARTIAL_SUCCESS_STOCK_UPDATED:
      "Venta procesada parcialmente. Causa: Se descontó el stock correctamente, pero hubo un problema técnico al registrar la venta en el historial. Solución: El stock está actualizado, por favor notifica al soporte técnico sobre el error en el registro del historial.",
  };

  public static handle(error: any): AppError {
    // Si ya es un AppError, lo devolvemos
    if (error && typeof error === "object" && "source" in error) {
      return error as AppError;
    }

    // Manejo de errores de InfraClient
    if (error?.error?.code) {
      return {
        message: error.message,
        code: error.error.code,
        source: ErrorSource.INFRASTRUCTURE,
        statusCode: 400,
        details: error.error.details,
      };
    }

    // Error genérico
    return {
      message: error?.message || "An unexpected error occurred",
      code: "INTERNAL_SERVER_ERROR",
      source: ErrorSource.INTERNAL,
      statusCode: 500,
    };
  }

  public static formatForFrontend(error: AppError) {
    let userMessage =
      this.USER_MESSAGES[error.code] ||
      "Ha ocurrido un error inesperado. Por favor, intenta más tarde.";

    // Generar mensajes dinámicos y soluciones basadas en el tipo de error de permisos
    if (error.code === "ROLE_INSUFFICIENT" && error.details) {
      const { requiredRole, currentRole } = error.details;
      userMessage = `Acceso Restringido: Para realizar esta acción necesitas el rol de ${requiredRole}. Actualmente tienes el rol ${currentRole}. Por favor, solicita la actualización de tus permisos al Administrador del Sistema.`;
    } else if (error.code === "PLAN_INSUFFICIENT" && error.details) {
      const { requiredPlan } = error.details;
      userMessage = `Funcionalidad Premium: Esta característica está disponible únicamente en el plan ${requiredPlan.toUpperCase()}. Puedes mejorar tu plan desde la sección de Facturación o contactar a ventas para obtener más información.`;
    }

    return {
      success: false,
      message: error.message,
      user_message: userMessage,
      error: {
        code: error.code,
        source: error.source,
        details: error.details,
      },
    };
  }
}

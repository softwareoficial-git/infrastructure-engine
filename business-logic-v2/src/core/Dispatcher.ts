import { RequestContext } from "./RequestContext";
import { infraClient, ServiceResponse } from "./InfraClient";

export type CommandHandler = (
  context: RequestContext,
  params: any,
) => Promise<ServiceResponse>;

export interface CommandMetadata {
  name: string;
  description: string;
  requiredRole: "SISTEMA_ADMIN" | "DUEÑO" | "EMPLEADO" | "GUEST";
  requiredPlan?: "free" | "pro" | "enterprise";
}

interface RegisteredCommand {
  handler: CommandHandler;
  metadata: CommandMetadata;
}

class Dispatcher {
  private registry: Map<string, RegisteredCommand> = new Map();

  private readonly PLAN_WEIGHTS: Record<string, number> = {
    free: 0,
    pro: 1,
    enterprise: 2,
  };

  public register(
    name: string,
    metadata: CommandMetadata,
    handler: CommandHandler,
  ): void {
    this.registry.set(name, { handler, metadata });
  }

  private async logEvent(
    context: RequestContext,
    commandName: string,
    status: "SUCCESS" | "ERROR",
    details: any = {},
  ): Promise<void> {
    try {
      // Blindaje de Telemetría: Registro automático de cada acción en Infra
      await infraClient.execute(
        "SYSTEM:log-event",
        {
          status,
          source: "BUSINESS_V2",
          command: commandName,
          tenantId: context.tenantId,
          userId: context.userId,
          ...details,
        },
        context.token,
      );
    } catch (e) {
      console.error(`[TELEMETRY_ERROR] Failed to log event ${commandName}:`, e);
    }
  }

  public async execute(
    commandName: string,
    params: any,
    context: RequestContext,
  ): Promise<ServiceResponse> {
    const command = this.registry.get(commandName);

    if (!command) {
      return {
        success: false,
        message: `Command ${commandName} not found`,
        error: {
          code: "CMD_NOT_FOUND",
          message: "El comando solicitado no existe",
        },
      };
    }

    const { handler, metadata } = command;

    // Bypass RBAC and Plan validation for profile verification used in middleware
    if (commandName === "USER:get-profile" && context.role === "GUEST") {
      try {
        const result = await handler(context, params);
        return result;
      } catch (error: any) {
        return { success: false, message: error.message };
      }
    }

    // 1. Validación de Rol (RBAC)
    if (!this.validateRole(context.role, metadata.requiredRole)) {
      return {
        success: false,
        message: `Acceso denegado. Este comando requiere el rol ${metadata.requiredRole}, pero tu rol actual es ${context.role}.`,
        error: {
          code: "ROLE_INSUFFICIENT",
          message:
            "No tienes el nivel de acceso necesario para esta operación.",
          details: {
            requiredRole: metadata.requiredRole,
            currentRole: context.role,
          },
        },
      };
    }

    // 2. Validación de Suscripción (Plan Guard)
    const requiredPlan = metadata.requiredPlan || "free";
    const userPlan = context.plan || "free";
    if (
      (this.PLAN_WEIGHTS[userPlan] || 0) <
      (this.PLAN_WEIGHTS[requiredPlan] || 0)
    ) {
      return {
        success: false,
        message: `Este comando requiere un plan ${requiredPlan.toUpperCase()}. Tu plan actual es ${userPlan.toUpperCase()}.`,
        error: {
          code: "PLAN_INSUFFICIENT",
          message: "Tu plan actual no incluye esta funcionalidad.",
          details: { requiredPlan, currentPlan: userPlan },
        },
      };
    }

    // 3. Validación de Suscripción (Billing Guard - Expiración)
    const subscriptionCheck = await this.checkSubscription(context);
    if (!subscriptionCheck.success) {
      return subscriptionCheck;
    }

    try {
      const result = await handler(context, params);

      // Registrar éxito en telemetría
      await this.logEvent(context, commandName, "SUCCESS", {
        params: params,
        message: result.message,
      });

      return result;
    } catch (error: any) {
      // Registrar error en telemetría
      await this.logEvent(context, commandName, "ERROR", {
        error: error.message,
        params: params,
      });

      return {
        success: false,
        message: error.message || "Internal Execution Error",
        error: { code: "EXECUTION_ERROR", message: error.message },
      };
    }
  }

  private validateRole(userRole: string, requiredRole: string): boolean {
    const hierarchy: Record<string, number> = {
      SISTEMA_ADMIN: 3,
      DUEÑO: 2,
      EMPLEADO: 1,
      GUEST: 0,
    };

    return (hierarchy[userRole] || 0) >= (hierarchy[requiredRole] || 0);
  }

  private async checkSubscription(
    context: RequestContext,
  ): Promise<ServiceResponse> {
    if (context.role === "SISTEMA_ADMIN")
      return { success: true, message: "Admin bypass" };

    const res = await infraClient.readPath<any>(
      context.tenantId,
      "private_config.subscription",
      context.token,
    );

    if (!res.success)
      return { success: true, message: "No subscription set, trial active" };

    const sub = res.data;
    if (!sub)
      return { success: true, message: "No subscription set, trial active" };

    const now = new Date();
    const expiry = new Date(sub.expiry_date);

    if (now > expiry) {
      return {
        success: false,
        message: "Subscription expired",
        error: { code: "PLAN_EXPIRED", message: "Tu plan ha expirado" },
      };
    }

    return { success: true, message: "Subscription active" };
  }

  public getAvailableCommands() {
    return Array.from(this.registry.values()).map((c) => c.metadata);
  }
}

export const dispatcher = new Dispatcher();

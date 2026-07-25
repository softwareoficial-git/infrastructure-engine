export interface IPaymentGateway {
  name: string;
  createSubscription(clienteId: number, plan: string, months: number): Promise<{ success: boolean; data?: any; message?: string }>;
  handleWebhook(payload: any): Promise<{ success: boolean; message?: string; subscriptionId?: string }>;
}

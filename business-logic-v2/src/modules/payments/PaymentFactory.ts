import { IPaymentGateway } from './IPaymentGateway';

export class PaymentFactory {
  private static gateways: Map<string, IPaymentGateway> = new Map();

  static registerGateway(gateway: IPaymentGateway) {
    this.gateways.set(gateway.name, gateway);
  }

  static getGateway(name: string): IPaymentGateway {
    const gateway = this.gateways.get(name);
    if (!gateway) throw new Error(`Pasarela de pago ${name} no soportada`);
    return gateway;
  }
}

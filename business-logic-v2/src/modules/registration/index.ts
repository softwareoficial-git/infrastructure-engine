import { dispatcher } from '../../core/Dispatcher';
import { infraClient } from '../../core/InfraClient';

class RegistrationModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    dispatcher.register('APP:self-register', {
      name: 'APP:self-register',
      description: 'Registra un nuevo cliente y usuario administrador',
      requiredRole: 'GUEST'
    }, this.selfRegister);
  }

  private async selfRegister(context: any, params: any): Promise<any> {
    try {
      const res = await infraClient.execute('APP:self-register', params, '');
      if (!res.success) return res;
      return {
        success: true,
        message: 'Registration successful',
        data: res.data
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Registration error' };
    }
  }
}

export const registrationModule = new RegistrationModule();

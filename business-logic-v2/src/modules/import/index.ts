import { dispatcher } from '../../core/Dispatcher';
import { infraClient, ServiceResponse } from '../../core/InfraClient';
import { RequestContext } from '../../core/RequestContext';

class ImportModule {
  constructor() {
    this.registerCommands();
  }

  private registerCommands() {
    dispatcher.register('import.process', {
      name: 'import.process',
      description: 'Procesa datos crudos, valida y mapea antes de importar a Infra',
      requiredRole: 'DUEÑO'
    }, this.processImport);
  }

  private async processImport(context: RequestContext, params: any): Promise<ServiceResponse> {
    const { rawData, mapping } = params;

    if (!rawData || !Array.isArray(rawData) || !mapping) {
      return { success: false, message: 'Se requieren rawData (array) y mapping' };
    }

    // 1. Lógica de negocio: Procesamiento y Transformación
    console.log(`[IMPORT] Procesando ${rawData.length} items...`);
    
    // Transformación basada en mapping
    const processedData = rawData.map((item: any, index: number) => {
      const mappedItem: any = {};
      for (const [sourceKey, targetKey] of Object.entries(mapping)) {
        if (item.hasOwnProperty(sourceKey)) {
          mappedItem[targetKey as string] = item[sourceKey];
        }
      }
      
      // Validación de negocio: precio obligatorio y numérico
      if (mappedItem.price !== undefined && isNaN(Number(mappedItem.price))) {
        throw new Error(`Precio inválido en ítem ${index}`);
      }
      return mappedItem;
    });

    // 2. Delegación a Infraestructura con los datos ya organizados
    // Creamos un mapeo de identidad para que Infra sepa cómo interpretar
    // las claves que ya están en processedData. Infra recibirá 'cod_prod': 'cod_prod',
    // 'price': 'price', etc., y persistirá estos datos directamente.
    const identityMapping: any = {};
    if (processedData.length > 0) {
      Object.keys(processedData[0]).forEach(finalKey => {
        identityMapping[finalKey] = finalKey;
      });
    }

    console.log('[DEBUG] Processed Data from Business V2:', JSON.stringify(processedData, null, 2));
    console.log('[DEBUG] Identity Mapping sent to Infra:', JSON.stringify(identityMapping, null, 2));

    return infraClient.execute('CLIENT:data-import', {
      mapping: identityMapping, 
      data: processedData
    }, context.token);
  }
}

export const importModule = new ImportModule();

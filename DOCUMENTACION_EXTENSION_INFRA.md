# Guía de Extensión: Infrastructure Engine

Esta guía documenta los procedimientos estándar para extender el motor de infraestructura sin comprometer la estabilidad del sistema.

## 1. Registro de Nuevos Dominios y Comandos

Para agregar nuevas funcionalidades al motor (ej. un dominio nuevo o nuevos comandos en uno existente), sigue estos pasos:

### Paso A: Crear el archivo de dominio
Crea un nuevo archivo en `infrastructure-engine/src/domains/` (ej. `mi_nuevo_dominio.js`).

### Paso B: Definir la Clase del Dominio
Tu clase debe seguir la estructura estándar del motor:

```javascript
const motor = require('../core/motor');
const db = require('../core/db');

class MiNuevoDominio {
  static domain = 'NUEVO_DOMINIO';

  static schemas = { /* AJV Schemas para validación de payload */ };
  static docs = { /* Documentación del comando y posibles errores */ };

  static commands = {
    'mi-comando': async function (user, payload, txClient = null) {
      // Lógica de negocio/base de datos
      const client = txClient || db;
      // ...
      return { status: 'success', data: ... };
    }
  };
}

// Paso C: Registrar el dominio
motor.registerDomain(MiNuevoDominio);
module.exports = {};
```

### Paso D: Importar en el servidor
Para que el motor cargue tu nuevo dominio al arrancar, añádelo en `infrastructure-engine/src/server.js`:

```javascript
// ...
require('./domains/mi_nuevo_dominio');
// ...
```

---

## 2. Gestión de Base de Datos y Migraciones

Si tus nuevos comandos requieren **cambios estructurales** (tablas, columnas) o cambios en los datos existentes, debes usar el sistema de versiones:

### Paso A: Modificar `migrate-schema`
En `infrastructure-engine/src/domains/system.js`, busca la función `migrate-schema` y añade un bloque para la nueva versión:

```javascript
if (currentVersion < NUEVA_VERSION && targetVersion >= NUEVA_VERSION) {
  console.log('Aplicando Migración vN...');
  
  // 1. Ejecutar SQL de cambios (CREATE TABLE, ALTER TABLE, etc.)
  await client.query(`...`);
  
  // 2. Actualizar la versión de los clientes
  await client.query('UPDATE clientes SET schema_version = NUEVA_VERSION');
  console.log('✅ Migración vN completada.');
}
```

### Paso B: Activar la Migración
Modifica la variable `TARGET_VERSION` en `infrastructure-engine/src/server.js` para que coincida con `NUEVA_VERSION`. Esto disparará la migración automáticamente al reiniciar el servicio.

---

## 3. Resumen de Buenas Prácticas
1. **No modificar tablas existentes si es posible:** Usa JSONB en la tabla `clientes` para datos dinámicos.
2. **Usa `txClient`:** Siempre pasa `txClient` en tus funciones si planeas ejecutar comandos dentro de una transacción (`SYSTEM:batch`).
3. **Idempotencia:** Asegúrate de usar `IF NOT EXISTS` en tus sentencias SQL para evitar errores en despliegues posteriores.

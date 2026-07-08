# 📖 Manual de Integración del Infrastructure Engine
## 🚀 Guía de Consumo para Desarrolladores

Este documento ha sido generado mediante **pruebas empíricas** sobre el servidor en producción. No es una suposición, es el comportamiento real del sistema.

### 🛠️ Estándar de Petición
Todas las llamadas deben ser `POST` al endpoint `/execute`.

**Headers Obligatorios:**
- `Content-Type: application/json`
- `x-app-id: STRING` (Ej: `"ventas-web-v1"`, `"app-ios-prod"`) $\rightarrow$ **Crítico para soporte y auditoría.**

**Formato Base:**
```json
{
  "token": "STRING",
  "cmd": "DOMAIN:action",
  "tenantId": "STRING",
  "payload": { ... }
}
```

---

### ⚙️ Telemetría y Trazabilidad (v4)
Para reducir el tiempo de resolución de errores, el motor ahora captura automáticamente la procedencia de cada llamada.

| Campo | Origen | Propósito |
| :--- | :--- | :--- |
| `app_id` | Header `x-app-id` | Identifica qué aplicación específica originó el comando. |
| `ip_address` | Conexión TCP | Ubica la red desde la cual se realizó la petición. |
| `user_agent` | Header `User-Agent` | Identifica el navegador o cliente (Chrome, iOS, Axios, etc.). |
| `request_id` | Generado por Motor | Vincula el evento con los logs internos del servidor. |

**💡 Recomendación:** Siempre envía un `x-app-id` único por cada aplicación. Si reportas un error al equipo de infraestructura, adjunta el `requestId` recibido en la respuesta para una localización instantánea del fallo.

---

### 📂 Dominios y Funciones Verificadas

#### 1. Dominio `USER` (Manipulación de Datos Dinámicos)
| Comando | Propósito | Ejemplo de Payload | Error Común |
| :--- | :--- | :--- | :--- |
| `read` | Obtener config pública | `{"clienteId": 20}` | `CLIENT_NOT_FOUND` |
| `write` | Merge de datos globales | `{"clienteId": 20, "data": {...}}` | `VALIDATION_ERROR` |
| `update-path` | Cambio de valor puntual | `{"clienteId": 20, "path": "a.b", "value": "v"}` | `PATH_NOT_FOUND` |
| `push-item` | Insertar en array | `{"clienteId": 20, "path": "list", "item": {}}` | `VALIDATION_ERROR` |

#### 2. Dominio `APP` (Infraestructura)
| Comando | Propósito | Ejemplo de Payload | Comportamiento |
| :--- | :--- | :--- | :--- |
| `client-create` | Nuevo cliente | `{"nombre": "Tienda X"}` | Asigna Plan Free y Plantilla Oficial. |
| `update-client-plan`| Cambio de plan | `{"clienteId": 20, "plan": "pro"}` | Actualiza `private_config`. |

#### 3. Dominio `CLIENT` (Usuarios)
| Comando | Propósito | Ejemplo de Payload | Resultado |
| :--- | :--- | :--- | :--- |
| `user-create` | Nuevo usuario | `{"username": "...", "password": "...", ...}` | Retorna Token de Acceso. |
| `user-list` | Listar usuarios | `{"clienteId": 20}` | Filtra estrictamente por tenant. |

#### 4. Dominio `MONITOR` (Métricas)
| Comando | Propósito | Ejemplo de Payload | Resultado |
| :--- | :--- | :--- | :--- |
| `get-client-report` | Reporte de Negocio | `{"clienteId": 20}` | Calcula Valor de Inventario en tiempo real. |
| `get-system-health` | Salud del Motor | `{}` | Verifica DB y Engine. |

---

### ⚠️ Matriz de Errores (Cómo reaccionar en el Front)

| Código de Error | Significado | Acción Recomendada en el Frontend |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | El payload está mal formado | Mostrar errores en los campos resaltados en `details`. |
| `CLIENT_NOT_FOUND` | El ID del cliente no existe | Redirigir a la pantalla de selección de cliente. |
| `FORBIDDEN` | Token sin permisos para este dominio | Mostrar mensaje "Acceso Restringido". |
| `PATH_NOT_FOUND` | La ruta JSONB no existe | Verificar que la propiedad haya sido creada previamente. |

---
**Estado del Sistema:** 🟢 Operativo | **Comandos Verificados:** 15+ | **Cobertura de Errores:** 80%

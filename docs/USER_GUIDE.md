# 📘 Guía de Usuario Final: Infrastructure Engine

Esta guía describe cómo registrarse y operar el sistema utilizando el endpoint de ejecución.

## 🚀 Paso 1: Registro (Onboarding)
El registro es público. Crea tu cuenta y tu empresa en un solo paso.

**Endpoint:** `POST /register`
**Payload:**
```json
{
  "username": "tu_usuario",
  "password": "tu_password_segura",
  "nombreCliente": "Nombre de tu Empresa"
}
```
**Respuesta Clave:** Guarda el `token` y el `cliente.id` que recibirás en la respuesta.

---

## 🔑 Paso 2: Ejecución de Comandos
Todos los comandos se envían al mismo endpoint utilizando tu token de sesión.

**Endpoint:** `POST /execute`
**Estructura Base del Payload:**
```json
{
  "token": "TU_TOKEN_AQUI",
  "command": "DOMINIO:accion",
  "payload": {
    "dato": "valor"
  }
}
```

---

## 🛠️ Comandos Disponibles para el DUEÑO

### A. Gestión de Datos del Negocio (`USER` Domain)
Ideal para manejar inventarios, configuraciones o ventas en formato JSON.

| Acción | Propósito | Payload Ejemplo |
| :--- | :--- | :--- |
| `USER:write` | Guardar/Actualizar datos | `{"clienteId": 151, "data": {"stock": {"prod1": 10}}}` |
| `USER:read` | Leer toda la config | `{"clienteId": 151}` |
| `USER:update-path`| Cambiar un valor único | `{"clienteId": 151, "path": "settings.theme", "value": "dark"}` |
| `USER:push-item` | Añadir a una lista | `{"clienteId": 151, "path": "sales", "item": {"id": 1, "total": 50}}` |

### B. Gestión de Equipo (`CLIENT` Domain)
Administra los usuarios que trabajan en tu empresa.

| Acción | Propósito | Payload Ejemplo |
| :--- | :--- | :--- |
| `CLIENT:user-create`| Crear empleado | `{"username": "empleado1", "password": "pw", "role": "EMPLEADO", "clienteId": 151}` |
| `CLIENT:user-list` | Listar equipo | `{"clienteId": 151}` |

### C. Monitoreo y Perfil (`MONITOR` & `USER` Domain)
Consultas de estado y cuenta.

| Acción | Propósito | Payload Ejemplo |
| :--- | :--- | :--- |
| `USER:get-profile` | Ver mis datos | `{}` |
| `MONITOR:get-client-report`| Reporte de negocio | `{"clienteId": 151}` |

---

## ⚠️ Reglas de Seguridad Aplicadas
1.  **Aislamiento:** Aunque intentes enviar un `clienteId` ajeno en comandos de escritura (`write`, `user-create`), el sistema **lo ignorará** y guardará los datos en tu propio tenant.
2.  **Roles:** No puedes crear usuarios con roles `ADMINISTRADOR` o `SUPER_ADMIN`.
3.  **Acceso:** Comandos como `SYSTEM:init` o `MONITOR:get-global-stats` devolverán `ACCESO_DENEGADO_ROL`.

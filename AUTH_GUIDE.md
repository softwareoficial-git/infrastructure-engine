# Guía de Autenticación - Infrastructure Engine

Esta guía describe el flujo de autenticación simplificado, diseñado para facilitar la integración con el frontend y soportar múltiples sesiones simultáneas.

## 1. Registro de Usuario y Cliente (`/register`)

El endpoint de registro permite crear una cuenta de usuario y un cliente asociado en un solo paso. El nombre del cliente es opcional; si se omite, el sistema generará uno automáticamente.

**Endpoint:** `POST /register`

### Payload (Simplificado)
```json
{
  "username": "mi_usuario",
  "password": "PasswordSeguro123"
}
```

### Payload (Completo)
```json
{
  "username": "mi_usuario",
  "password": "PasswordSeguro123",
  "nombreCliente": "Mi Empresa S.A."
}
```

### Ejemplo con cURL
```bash
curl -X POST http://localhost:3001/register
     -H "Content-Type: application/json"
     -d '{"username": "mi_usuario", "password": "PasswordSeguro123"}'
```

**Respuesta Exitosa (201):**
Retorna el token inicial y la información del cliente creado.

---

## 2. Inicio de Sesión (`USER:login`)

El inicio de sesión valida las credenciales y genera un **nuevo token de sesión**. Este sistema implementa **Rotación de Tokens** y **Soporte Multi-dispositivo**.

**Endpoint:** `POST /execute`

### Payload
```json
{
  "command": "USER:login",
  "payload": {
    "username": "mi_usuario",
    "password": "PasswordSeguro123"
  }
}
```

### Ejemplo con cURL
```bash
curl -X POST http://localhost:3001/execute
     -H "Content-Type: application/json"
     -d '{"command": "USER:login", "payload": {"username": "mi_usuario", "password": "PasswordSeguro123"}}'
```

**Respuesta Exitosa (200):**
Retorna un token único para esa sesión específica.
```json
{
  "status": "success",
  "data": {
    "status": "success",
    "token": "uuid-generado-en-cada-login",
    "user": {
      "id": 123,
      "username": "mi_usuario",
      "role_name": "DUEÑO"
    }
  }
}
```

---

## 3. Ejecución de Comandos Autenticados

Para realizar cualquier acción protegida, el frontend debe incluir el token obtenido en el login en la raíz del cuerpo de la petición.

**Endpoint:** `POST /execute`

### Payload Ejemplo (Obtener Perfil)
```json
{
  "token": "token-obtenido-en-login",
  "command": "USER:get-profile",
  "payload": {}
}
```

### Ejemplo con cURL
```bash
curl -X POST http://localhost:3001/execute
     -H "Content-Type: application/json"
     -d '{"token": "TU_TOKEN", "command": "USER:get-profile", "payload": {}}'
```

---

## Detalles Técnicos de Sesión

### Rotación de Tokens
Cada vez que se ejecuta `USER:login`, se genera un token nuevo. Esto permite que el frontend actualice su caché y asegura que las sesiones tengan un ciclo de vida controlado.

### Soporte Multi-dispositivo
El sistema utiliza una tabla de `sesiones` independiente de la tabla de `usuarios`. Esto permite que un usuario tenga múltiples tokens activos simultáneamente (ej: uno en móvil y otro en PC) sin que el inicio de sesión en un dispositivo cierre la sesión en los demás.

### Seguridad
- **Contraseñas**: Almacenadas utilizando hashes de `bcrypt`.
- **Tokens**: Generados mediante `UUID v4`.
- **Sanitización**: Todos los payloads pasan por un middleware de sanitización global para prevenir XSS e inyecciones.

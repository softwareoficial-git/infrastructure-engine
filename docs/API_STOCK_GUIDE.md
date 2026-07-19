# Guía Técnica: API de Gestión de Stock

Esta guía documenta cómo los desarrolladores pueden interactuar con el motor de infraestructura para gestionar el stock de productos.

## 1. Autenticación
Antes de realizar cualquier operación, es necesario autenticarse para obtener un token válido.

**Endpoint:** `POST /execute`
**Comando:** `USER:login`

**Payload:**
```json
{
  "command": "USER:login",
  "payload": {
    "username": "TU_USUARIO",
    "password": "TU_PASSWORD"
  }
}
```
*Respuesta:* El sistema devolverá un JSON con un campo `token` dentro de `data`. **Guarda este token para las peticiones posteriores.**

---

## 2. Importación de Stock Masivo
Para importar productos desde sistemas externos, utiliza el comando `CLIENT:data-import`. El sistema permite mapear campos del sistema origen a la estructura interna.

**Endpoint:** `POST /execute`
**Comando:** `CLIENT:data-import`

**Payload:**
```json
{
  "token": "TU_TOKEN_AQUI",
  "command": "CLIENT:data-import",
  "payload": {
    "mapping": {
      "campo_origen_1": "campo_destino_interno_1",
      "campo_origen_2": "campo_destino_interno_2"
    },
    "data": [
      { "campo_origen_1": "valor1", "campo_origen_2": "valor2" }
    ]
  }
}
```

---

## 3. Consulta de Stock
Para visualizar el stock actual de un cliente, utiliza el comando `USER:read-path`.

**Endpoint:** `POST /execute`
**Comando:** `USER:read-path`

**Payload:**
```json
{
  "token": "TU_TOKEN_AQUI",
  "command": "USER:read-path",
  "payload": {
    "clienteId": ID_DEL_CLIENTE,
    "path": "stock"
  }
}
```
*Respuesta:* El campo `data.value` contendrá el array con la lista completa de productos.

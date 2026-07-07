#!/bin/bash
TOKEN="ADMIN_SECRET_TOKEN_2026"
URL="http://localhost:3001/execute"

echo "--- 1. CONFIGURANDO PLANTILLA RETAIL ---"
T_RES=$(curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:template-create", "payload": {"nombre": "Retail Base", "contenido": {"stock": [], "precios": {}}}")
T_ID=$(echo $T_RES | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "Plantilla creada ID: $T_ID"

curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:template-publish", "payload": {"templateId": $T_ID}}"
echo -e "
Plantilla publicada."

echo -e "
--- 2. CREANDO CLIENTE (TIENDA) ---"
C_RES=$(curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:client-create", "payload": {"nombre": "Tienda Central"}}")
C_ID=$(echo $C_RES | grep -o '"id":[0-9]*' | cut -d: -f2)
echo "Cliente creado ID: $C_ID"

echo -e "
--- 3. CREANDO PERSONAL (USUARIOS) ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "CLIENT:user-create", "payload": {"username": "admin_tienda", "password": "pass123", "role_id": 2, "clienteId": $C_ID}}"
echo -e "
Admin creado."

curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "CLIENT:user-create", "payload": {"username": "emp_01", "password": "pass123", "role_id": 4, "clienteId": $C_ID}}"
echo -e "
Empleado creado."

echo -e "
--- 4. CARGANDO STOCK (INVENTARIO) ---"
STOCK_DATA='{"stock": [{"id": 1, "prod": "iPhone", "qty": 10}], "precios": {"iPhone": 1000}}'
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "USER:write", "payload": {"clienteId": $C_ID, "data": $STOCK_DATA}}"
echo -e "
Stock inicial cargado."

echo -e "
--- 5. SIMULANDO VENTA (REDUCCIÓN DE STOCK) ---"
SALE_DATA='{"stock": [{"id": 1, "prod": "iPhone", "qty": 8}]}'
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "USER:write", "payload": {"clienteId": $C_ID, "data": $SALE_DATA}}"
echo -e "
Venta procesada."

echo -e "
--- AUDITORÍA FINAL: ESTADO DEL CLIENTE ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "USER:read", "payload": {"clienteId": $C_ID}}"
echo -e "
"

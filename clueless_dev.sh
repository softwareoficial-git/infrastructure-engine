#!/bin/bash
TOKEN="ADMIN_SECRET_TOKEN_2026"
URL="http://localhost:3001/execute"

echo "--- TEST 1: No Token (The 'I just started' mistake) ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d '{"command": "SYSTEM:get-global-stats"}'
echo -e "
"

echo "--- TEST 2: Fake Token (The 'I'll just guess' mistake) ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "SECRET123", "command": "SYSTEM:get-global-stats"}"
echo -e "
"

echo "--- TEST 3: Ghost Command (The 'Typo' mistake) ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "SYSTEM:get_stats"}"
echo -e "
"

echo "--- TEST 4: Bad Payload (The 'I forgot a field' mistake) ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:client-create", "payload": {}}"
echo -e "
"

echo "--- TEST 5: Forbidden Access (The 'I want to be admin' mistake) ---"
T_RES=$(curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:template-create", "payload": {"nombre": "T", "contenido": {"stock": [], "precios": {}}}")
T_ID=$(echo $T_RES | grep -o '"id":[0-9]*' | cut -d: -f2)
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:template-publish", "payload": {"templateId": $T_ID}}"

C_RES=$(curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "APP:client-create", "payload": {"nombre": "TestClient"}}")
C_ID=$(echo $C_RES | grep -o '"id":[0-9]*' | cut -d: -f2)

U_RES=$(curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "CLIENT:user-create", "payload": {"username": "poor_user", "password": "123", "role_id": 4, "clienteId": $C_ID}}")
U_TOKEN=$(echo $U_RES | grep -o '"token":"[^"]*"' | cut -d: -f2 | tr -d '"')

echo "Testing restricted access with user token: $U_TOKEN"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$U_TOKEN", "command": "SYSTEM:get-global-stats"}"
echo -e "
"

echo "--- TEST 6: Successful Flow (The 'I finally learned' stage) ---"
curl -s -X POST $URL -H "Content-Type: application/json"
     -d "{"token": "$TOKEN", "command": "MONITOR:get-system-health"}"
echo -e "
"

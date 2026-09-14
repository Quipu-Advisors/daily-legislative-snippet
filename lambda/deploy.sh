#!/bin/bash
# Deploya la funcion Lambda que hace el sync + digest de DLS. Correr desde cualquier lado;
# las rutas son relativas a la ubicacion de este script.
set -euo pipefail
cd "$(dirname "$0")"

FUNCTION_NAME="dls-tracker-sync"
ROLE_NAME="dls-tracker-lambda-role"
ROLE_ARN="arn:aws:iam::873775216030:role/${ROLE_NAME}"

echo "== Zipping (sin dependencias npm -- solo fetch nativo) =="
rm -f function.zip
powershell.exe -NoProfile -Command "Compress-Archive -Path handler.mjs -DestinationPath function.zip -Force"
echo "Zip size: $(du -h function.zip | cut -f1)"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "== Role $ROLE_NAME ya existe =="
else
  echo "== Creando rol de ejecucion $ROLE_NAME =="
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --tags Key=Project,Value=dls >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "Esperando propagacion del rol..."
  sleep 10
fi

if aws lambda get-function --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  echo "== Actualizando codigo de la funcion existente =="
  aws lambda update-function-code --function-name "$FUNCTION_NAME" --zip-file fileb://function.zip >/dev/null
  echo "== Actualizando variables de entorno =="
  sleep 5
  aws lambda update-function-configuration --function-name "$FUNCTION_NAME" \
    --environment file://env.json >/dev/null || echo "  (omitido -- reintentar si hace falta; el codigo ya quedo actualizado)"
else
  echo "== Creando funcion =="
  aws lambda create-function --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x --handler handler.handler --role "$ROLE_ARN" \
    --zip-file fileb://function.zip --timeout 30 --memory-size 256 \
    --environment file://env.json \
    --tags Project=dls >/dev/null
  echo "== Funcion creada -- falta conectarla a API Gateway y al EventBridge Scheduler (ver CLAUDE.md) =="
fi

echo "== Listo =="

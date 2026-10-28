# Despliegue Dev 3 — us-east-2

`ecs_service.json` es una plantilla: reemplazar los tres valores `REPLACE_*`
por la imagen ECR y los roles de servicio reales. No contiene credenciales.
El plan abrevia incorrectamente `--container-port` como opción raíz: Express
Mode recibe `containerPort` dentro de `primaryContainer`. La baja usa el ARN.

1. Confirmar Región en AWS Settings > View all projects > Overview > Additional
   Info > Region (configuración comprobada: us-east-2). Revisar el plan y el
   gasto en AWS Settings > Billing.
2. Construir y probar `docker build -f infra/Dockerfile -t manta-sim:dev3 .`.
3. Publicar la imagen en un repositorio ECR privado de us-east-2, usando una
   etiqueta de commit inmutable. Crear los roles de servicio de ECS siguiendo
   la documentación oficial; no asignar roles a personas.
   - Execution role: confianza `ecs-tasks.amazonaws.com`, política
     `AmazonECSTaskExecutionRolePolicy` para descarga ECR y logs.
   - Infrastructure role: confianza `ecs.amazonaws.com`, política
     `AmazonECSInfrastructureRoleforExpressGatewayServices`.
   - El operador necesita `iam:PassRole` limitado a esos dos roles.
4. Completar `ecs_service.json` y ejecutar:

```powershell
aws ecs create-express-gateway-service --region us-east-2 --cli-input-json file://infra/ecs_service.json
```

Guardar el ARN y el dominio devueltos. La configuración fija 256 unidades CPU,
512 MiB, una tarea, puerto 8000 y `/health`. Validar las opciones contra la
versión instalada de AWS CLI; no usar los valores predeterminados más grandes.

```powershell
aws ecs describe-express-gateway-service --region us-east-2 --service-arn <ARN>
Invoke-RestMethod https://<DOMINIO>/health
```

Comprobar también `/`, una simulación con `configs/default_params.json` y
HTTPS desde otra red. Copiar la URL real al README solamente después de probar.

## Retirar el servicio

```powershell
aws ecs delete-express-gateway-service --region us-east-2 --service-arn <ARN>
```

Esperar la eliminación y revisar ALB, tareas, IP públicas, logs e imágenes ECR:
el borrado del servicio no demuestra que todos los recursos de soporte hayan
desaparecido. Retirar únicamente los creados para este despliegue.

## Nivel Pro condicional

`step_function_def.json` se registra con `--type EXPRESS` y se invoca con
`start-sync-execution`. Sustituir `${WorkerArn}` por una Lambda Python 3.12 de
us-east-2 cuyo handler sea `lambda_worker.handler`. Empaquetar `lambda_worker.py`,
`src/seir/` como paquete `seir/`, y las dependencias Linux fijadas; nunca copiar
ruedas Windows. El rol Lambda necesita logs; el rol Step Functions necesita
`lambda:InvokeFunction` limitado al ARN del worker.

Entrada: `{"base": <configuración>, "seeds": [42,43,44]}` (1–100 semillas).
El Inline Map retorna métricas por réplica y la tarea Agregar devuelve solo
media, p2.5, p97.5, mínimo y máximo. Este complemento no está desplegado y no se
activa antes de validar la URL principal. `/api/batch` funciona sin AWS usando
un ProcessPoolExecutor local; las dos rutas no se confunden en la interfaz.

Fuentes oficiales:
- https://docs.aws.amazon.com/cli/latest/reference/ecs/create-express-gateway-service.html
- https://docs.aws.amazon.com/cli/latest/reference/ecs/delete-express-gateway-service.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html

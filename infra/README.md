# Despliegue Dev 3 — us-east-2

`ecs_service.json` contiene la configuración real ya desplegada (imagen inmutable
del commit `a4d7bb2`, roles de servicio y 256 CPU / 512 MiB). No contiene
credenciales. Para otro entorno, reemplazar imagen y ARN de roles. Express Mode
recibe `containerPort` dentro de `primaryContainer`. La baja usa el ARN.

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
HTTPS desde otra red. El servicio desplegado quedó verificado en
https://sp-5fba9b85d454464f8e6c6409e5df280d.ecs.us-east-2.on.aws; los detalles
de la reparación y publicación están en [../docs/aws-deployment.md](../docs/aws-deployment.md).

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
media, p2.5, p97.5, mínimo y máximo. La definición real desplegada está en
`stepfunctions-real.json`; `step_function_def.json` sigue siendo la plantilla
portable con `${WorkerArn}`. `/api/batch` funciona sin AWS usando un
ProcessPoolExecutor local; las dos rutas no se confunden en la interfaz.

## Plan B: ECS Fargate tradicional (receta, no ejecutada)

Si Express Mode falla, conservar la misma imagen y execution role. Crear un
clúster `manta-fallback`, dos subredes de la VPC en distintas zonas de us-east-2
y un ALB público. El security group del ALB admite HTTPS 443; el de la tarea
admite 8000 únicamente desde el security group del ALB. No abrir el puerto
8000 de la tarea a Internet. La tarea puede usar subredes públicas con IP para
descargar ECR sin NAT; no habilitar entrada directa a esa IP.

Guardar un array de contenedores en `infra/containers.local.json` (reemplazar
la imagen por su URI ECR inmutable):

```json
[{"name":"manta","image":"<ECR_IMAGE_URI>","essential":true,
  "portMappings":[{"containerPort":8000,"protocol":"tcp"}]}]
```

```powershell
aws ecs create-cluster --region us-east-2 --cluster-name manta-fallback
aws ecs register-task-definition --region us-east-2 --family manta-fallback --network-mode awsvpc --requires-compatibilities FARGATE --cpu 256 --memory 512 --execution-role-arn <EXECUTION_ROLE_ARN> --container-definitions file://infra/containers.local.json
aws elbv2 create-load-balancer --region us-east-2 --name manta-fallback --type application --scheme internet-facing --subnets <SUBNET_A> <SUBNET_B> --security-groups <ALB_SG>
aws elbv2 create-target-group --region us-east-2 --name manta-fallback --protocol HTTP --port 8000 --vpc-id <VPC_ID> --target-type ip --health-check-path /health
aws elbv2 create-listener --region us-east-2 --load-balancer-arn <ALB_ARN> --protocol HTTPS --port 443 --certificates CertificateArn=<ACM_CERT_ARN> --default-actions Type=forward,TargetGroupArn=<TARGET_GROUP_ARN>
```

El certificado ACM debe estar validado en us-east-2 y corresponder al dominio
público del ALB mediante DNS. Fargate tradicional no proporciona por sí solo
un dominio HTTPS automático; sin certificado/dominio válidos este Plan B no
cumple la entrega pública. No sustituir HTTPS por una IP HTTP.

Guardar `infra/network.local.json` con
`{"awsvpcConfiguration":{"subnets":["<SUBNET_A>","<SUBNET_B>"],"securityGroups":["<TASK_SG>"],"assignPublicIp":"ENABLED"}}` y registrar el servicio:

```powershell
aws ecs create-service --region us-east-2 --cluster manta-fallback --service-name manta-fallback --task-definition <TASK_DEFINITION_ARN> --desired-count 1 --launch-type FARGATE --network-configuration file://infra/network.local.json --load-balancers targetGroupArn=<TARGET_GROUP_ARN>,containerName=manta,containerPort=8000
```

Añadir logs de CloudWatch a la definición antes de producción, comprobar el
target saludable y repetir salud/simulación por HTTPS desde otra red. Retirar:
`aws ecs delete-service --region us-east-2 --cluster manta-fallback --service manta-fallback --force`,
esperar tareas detenidas, borrar listener/ALB/target group y clúster, y revisar
logs e imágenes residuales. No retirar VPC, subredes o certificados compartidos.

Fuentes oficiales:
- https://docs.aws.amazon.com/cli/latest/reference/ecs/create-express-gateway-service.html
- https://docs.aws.amazon.com/cli/latest/reference/ecs/delete-express-gateway-service.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html

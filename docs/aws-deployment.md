# Despliegue AWS por CLI + Docker — 28 de octubre de 2026

Fuente de la imagen: commit `a4d7bb2`, Linux amd64, Python 3.12.
Región: `us-east-2`. Proyecto: `887324469817`.

## Recursos usados

- ECR existente: `spookython-simulador`.
- Etiqueta publicada: `git-a4d7bb2`.
- Imagen fijada por digest:
  `sha256:4ff5534241ce1dbfd134b0cc79d022ccf6d7ef71ee62647eaaca24b670b4d8c5`.
- Clúster existente: `default`; servicio Express existente: `spookython-web`.
- Servicio: `arn:aws:ecs:us-east-2:887324469817:service/default/spookython-web`.
- Ejecución: `arn:aws:iam::887324469817:role/service-role/ecsTaskExecutionRole`.
- Infraestructura: `arn:aws:iam::887324469817:role/service-role/ecsInfrastructureRoleForExpressServices`.
- Capacidad solicitada: 256 CPU / 512 MiB, una tarea, puerto 8000, `/health`.
- Logs: `/aws/ecs/default/spookython-web-14ac` en us-east-2.

## Reparación comprobada

El servicio existía con cero tareas. CloudTrail mostró que la creación del ALB
fallaba porque el rol de infraestructura no tenía `ec2:DescribeAccountAttributes`.
Se conservó su política administrada y se añadió exclusivamente esa lectura,
limitada a `aws:RequestedRegion=us-east-2`, mediante
`infra/ecs-provisioning-read-policy.json`. `Resource: "*"` es necesario para
esta acción de descripción, que no admite un ARN de recurso concreto.

```powershell
aws iam put-role-policy --role-name ecsInfrastructureRoleForExpressServices --policy-name MantaExpressRegionalAccountDiscovery --policy-document file://infra/ecs-provisioning-read-policy.json
```

Se comprobó con `simulate-principal-policy` que la acción queda permitida.
No se alteraron roles de acceso humano ni se añadieron políticas de administrador.

## Publicación de imagen

```powershell
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 887324469817.dkr.ecr.us-east-2.amazonaws.com
docker build --platform linux/amd64 -f infra/Dockerfile -t 887324469817.dkr.ecr.us-east-2.amazonaws.com/spookython-simulador:git-a4d7bb2 .
docker push 887324469817.dkr.ecr.us-east-2.amazonaws.com/spookython-simulador:git-a4d7bb2
```

En este equipo falló el almacén de credenciales de Docker Desktop con
«The stub received bad data». Se usó `docker --config <directorio temporal>`
con un `config.json` de autenticación aislado. Tras publicar se ejecutó logout
y se eliminó ese archivo. Ninguna credencial se imprimió ni se versionó.

## Actualización del servicio existente

`infra/ecs_service.json` contiene ahora la configuración real para creación.
Para actualizar se generó `infra/ecs-update.local.json`: se retiraron los campos
de creación `serviceName`, `cluster`, `infrastructureRoleArn` y `tags`, y se
añadió `serviceArn`. Ese archivo local está ignorado por Git.

```powershell
aws ecs update-express-gateway-service --region us-east-2 --cli-input-json file://infra/ecs-update.local.json
aws ecs describe-express-gateway-service --region us-east-2 --service-arn arn:aws:ecs:us-east-2:887324469817:service/default/spookython-web
aws ecs describe-services --region us-east-2 --cluster default --services spookython-web
```

## Retiro tras la evaluación

```powershell
aws ecs delete-express-gateway-service --region us-east-2 --service-arn arn:aws:ecs:us-east-2:887324469817:service/default/spookython-web
```

Esperar la eliminación y revisar ALB, tareas, IP públicas, ECR y logs. Los
roles ya existían: no eliminarlos si otros recursos dependen de ellos. El
presupuesto USD 5 es una alerta, no un tope automático. Verificar el correo
destinatario y revisar AWS Settings > Billing durante el evento.

El servicio quedó estable en la revisión 8 y conserva la URL pública
`https://sp-5fba9b85d454464f8e6c6409e5df280d.ecs.us-east-2.on.aws`.
Se verificaron `GET /health` y `POST /api/simulate` desde el endpoint HTTPS.

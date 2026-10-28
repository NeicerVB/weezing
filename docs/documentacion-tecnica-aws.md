# Documentación técnica general — SpookyThon 2026

## 1. Descripción del proyecto

**Proyecto:** SpookyThon — Simulador de Contención Zombie  
**Categoría:** Track B — La Plaga Zombie  
**Ubicación del escenario:** Manta, Manabí, Ecuador  
**Plataforma de despliegue:** Amazon Web Services (AWS)

SpookyThon es una aplicación web que simula la propagación ficticia de una infección zombie mediante un modelo epidemiológico SEIR (Susceptibles, Expuestos, Infecciosos y Recuperados) sobre una red sintética de contactos.

El objetivo es comparar tres estrategias de contención:

1. **Sin intervención:** evolución del brote sin vacunación.
2. **Vacunación aleatoria:** distribución de dosis de manera aleatoria.
3. **Estrategia propuesta:** asignación estratégica de vacunas considerando la estructura de la red de contactos.

El sistema permite modificar parámetros como población, duración, tasa de contagio, eficacia de las vacunas y disponibilidad de dosis.

Los resultados se presentan mediante indicadores, curvas comparativas y una visualización territorial basada en siete sectores de Manta.

El proyecto tiene fines exclusivamente académicos y no representa una predicción epidemiológica real.

## 2. Tecnologías utilizadas

| Componente | Tecnología |
|---|---|
| Lenguaje principal | Python 3.12 |
| Backend | FastAPI |
| Servidor web | Uvicorn |
| Frontend | HTML, CSS y JavaScript |
| Visualización | SVG y JavaScript |
| Modelo de simulación | SEIR sobre grafos |
| Contenedores | Docker |
| Plataforma cloud | Amazon Web Services |
| Análisis estadístico | Simulación Monte Carlo |

## 3. Servicios AWS implementados

### 3.1. Amazon ECS y AWS Fargate

Se utilizó Amazon Elastic Container Service (ECS), mediante Express Mode y AWS Fargate, para ejecutar la aplicación web sin administrar servidores físicos o máquinas virtuales.

El servicio principal se denomina `spookython-web` y ejecuta el contenedor que contiene FastAPI, el motor SEIR y la interfaz web.

La aplicación está publicada mediante HTTPS.

**Configuración principal:**

- Región: `us-east-2` (Ohio).
- Servicio: `spookython-web`.
- CPU: 256 unidades (0,25 vCPU).
- Memoria: 512 MiB.
- Puerto del contenedor: 8000.
- Endpoint de salud: `/health`.
- Imagen desplegada: commit `a4d7bb2`.

**URL pública:**

https://sp-5fba9b85d454464f8e6c6409e5df280d.ecs.us-east-2.on.aws

### 3.2. Amazon ECR

Amazon Elastic Container Registry (ECR) permite almacenar y distribuir las imágenes Docker del proyecto.

Se utilizó el repositorio privado `spookython-simulador` para almacenar la aplicación empaquetada. La versión verificada en el servicio público corresponde al commit `a4d7bb2`; también se construyó una variante `montecarlo-v2` que incorpora la conexión con AWS Step Functions.

Esto permite actualizar el sistema sin tener que reconstruir manualmente su entorno en los servidores.

### 3.3. AWS Lambda

Se implementó una función denominada `Spookython-MonteCarlo-Worker`, utilizando Python 3.12.

Inicialmente, la función contenía un ejemplo básico. Posteriormente, se sustituyó por el motor SEIR real del proyecto.

Sus responsabilidades son:

- Ejecutar una réplica epidemiológica con una semilla determinada.
- Obtener métricas de las tres estrategias.
- Generar series temporales para las gráficas.
- Agregar los resultados de múltiples réplicas.
- Calcular promedios, mínimos, máximos y percentiles empíricos.

La función fue probada satisfactoriamente mediante invocaciones directas desde AWS CLI.

### 3.4. AWS Step Functions

Se implementó la máquina de estados `Spookython-Simulation-Express` de tipo Express.

Su objetivo es coordinar las simulaciones Monte Carlo mediante dos etapas:

**Map:** distribuye las réplicas para que Lambda ejecute el motor SEIR con diferentes semillas. Se configuró una concurrencia máxima de 10.

**Agregar:** reúne las respuestas y utiliza Lambda para calcular estadísticas consolidadas.

Se realizó una prueba con tres réplicas que finalizó con estado `SUCCEEDED` y devolvió promedios, percentiles y series diarias de las estrategias.

### 3.5. Amazon CloudWatch

Se utilizó CloudWatch para consultar los registros de ejecución del contenedor ECS y de AWS Lambda.

Las consultas permitieron revisar la disponibilidad del backend, las solicitudes HTTP y las invocaciones de las funciones.

### 3.6. AWS IAM

Se configuró el rol `SpookythonECSTaskRole` para que el contenedor de FastAPI pueda solicitar ejecuciones a Step Functions.

Se utilizó el permiso `states:StartSyncExecution`, limitado a la máquina de estados del proyecto.

De esta manera, la aplicación puede acceder al servicio sin almacenar credenciales AWS directamente en el código.

### 3.7. AWS Budgets

Se creó el presupuesto mensual `Spookython-Budget` con un monto de **USD 5** para supervisar el consumo de la infraestructura.

Durante las verificaciones, el proyecto se encontraba cubierto por los créditos del plan AWS Free, con un importe pendiente de pago de USD 0,00.

El presupuesto funciona como mecanismo de seguimiento, no como límite automático de gasto. La verificación del correo destinatario quedó pendiente (consola 0/1).

## 4. Arquitectura general

El usuario accede a la aplicación publicada en Amazon ECS mediante HTTPS.

FastAPI recibe las solicitudes y ejecuta el procesamiento correspondiente.

**Simulación individual:**

Usuario → Amazon ECS → FastAPI → Motor SEIR → Resultados y gráficas.

**Simulación Monte Carlo con AWS:**

Usuario → Amazon ECS → FastAPI → AWS Step Functions → AWS Lambda → Agregación de estadísticas → FastAPI → Resultados y gráficas.

La aplicación dispone de procesamiento Monte Carlo local como respaldo si falla la invocación a Step Functions.

La integración AWS fue desplegada y se observaron invocaciones Lambda coincidentes con las pruebas web; sin embargo, no se obtuvo una traza individual completa que permitiera atribuir inequívocamente cada solicitud web a Step Functions.

## 5. Desarrollo y despliegue

El proceso técnico incluyó las siguientes actividades:

1. Preparación del código fuente y las dependencias de Python.
2. Construcción de la aplicación mediante Docker.
3. Pruebas locales del contenedor y de los endpoints de FastAPI.
4. Creación del repositorio privado en Amazon ECR.
5. Publicación de la imagen Docker en ECR.
6. Creación y configuración de servicios Amazon ECS Express Mode.
7. Publicación de la aplicación con acceso HTTPS.
8. Creación de la función AWS Lambda.
9. Empaquetado y despliegue del motor SEIR para Lambda.
10. Creación de la máquina AWS Step Functions Express.
11. Configuración del procesamiento Map y la agregación estadística.
12. Integración de FastAPI con AWS mediante `boto3`.
13. Configuración del rol IAM y sus permisos.
14. Actualización de la imagen Docker a `montecarlo-v2`.
15. Despliegue de la nueva versión en ECS.
16. Pruebas funcionales desde la aplicación pública.

## 6. Pruebas realizadas

| Prueba | Resultado |
|---|---|
| Disponibilidad de `/health` | HTTP 200 |
| Simulación individual desde la web | Correcta |
| Ejecución del motor SEIR en Lambda | Correcta |
| Tres réplicas mediante Step Functions | `SUCCEEDED` |
| Agregación estadística en Lambda | Correcta |
| Generación de series diarias | Correcta |
| Despliegue de `montecarlo-v2` | `SUCCESSFUL` |
| Solicitud web de 30 réplicas | HTTP 200 |
| Tiempo observado en prueba web de 30 réplicas | 4,4 segundos |
| Visualización de curvas Monte Carlo | Correcta |
| Trazabilidad individual web → Step Functions | Pendiente de confirmación definitiva |

El tiempo de 4,4 segundos corresponde a una prueba concreta y no representa una garantía de rendimiento para todas las configuraciones.

## 7. Resultados del simulador

En uno de los escenarios demostrativos se utilizaron:

- Población: 1.000 personas.
- Horizonte: 60 días.
- Semilla: 42.
- Tasa de contagio β: 0,03.
- Eficacia de vacunación: 0,8.
- Stock máximo de vacunas: 400 dosis.

La simulación individual mostró los siguientes resultados:

| Estrategia | Contagios acumulados | Contagios evitados | Dosis utilizadas |
|---|---:|---:|---:|
| Propuesta | 33 | 274 | 400 |
| Vacunación aleatoria | 146 | 161 | 400 |
| Sin intervención | 307 | 0 | 0 |

En ese escenario oficial, la estrategia propuesta evitó 274 contagios frente a la ausencia de intervención y 113 frente a la vacunación aleatoria.

Estos resultados dependen de los parámetros y de la semilla utilizada. No deben interpretarse como resultados epidemiológicos reales ni como conclusiones estadísticas universales.

## 8. Consideraciones económicas

La infraestructura utiliza servicios cuyo consumo depende del tiempo de funcionamiento y de la cantidad de solicitudes realizadas.

Amazon ECS Fargate puede generar consumo continuo mientras mantiene tareas activas. Lambda y Step Functions consumen recursos cuando ejecutan simulaciones.

En una revisión de AWS Billing se registraron los siguientes valores:

- Plan: AWS Free.
- Créditos disponibles: USD 159,99.
- Consumo registrado del proyecto: USD 0,01.
- Importe pendiente: USD 0,00.

Estos importes corresponden al momento de la consulta y pueden variar.

Se recomienda mantener únicamente los recursos necesarios para la evaluación y revisar los servicios duplicados una vez finalizada la presentación.

## 9. Conclusión

SpookyThon demuestra la aplicación de tecnologías cloud y modelos computacionales para estudiar estrategias ficticias de contención epidemiológica.

La solución combina una interfaz interactiva, un motor SEIR sobre grafos, simulaciones Monte Carlo y servicios administrados de AWS.

Amazon ECS permite publicar la aplicación, Amazon ECR facilita el almacenamiento de imágenes Docker, AWS Lambda ejecuta réplicas epidemiológicas y AWS Step Functions coordina su procesamiento y agregación.

Las pruebas realizadas validaron los principales componentes y demostraron que el simulador puede producir resultados estadísticos y visualizaciones desde una aplicación web pública.

La arquitectura proporciona una base extensible para futuras mejoras, como mayor trazabilidad de ejecuciones, monitoreo y automatización del despliegue.
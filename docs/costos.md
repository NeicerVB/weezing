# Costos y presupuesto — Dev 3

Recursos regionales: **us-east-2**. AWS Budgets es global: su consola no muestra
una Región de ejecución. Consulta del 28 de octubre de 2026:

- Plan FREE activo; créditos restantes consultados: USD 159,99.
- Presupuesto existente **Spookython-Budget**: USD 5 mensuales.
- Notificaciones de gasto real al 85 % y 100 %, y previsión al 100 %.
- La consola indica **0/1 destinatarios verificados**: el titular debe confirmar
  su correo para recibir avisos. No se enviaron mensajes desde esta sesión.
- Gasto mensual del proyecto según Budgets: **USD 0,011**, redondeado en consola
  a USD 0,01. No es gasto atribuido únicamente a este contenedor; facturación
  tiene retraso.
- Servicio ECS Express **spookython-web** desplegado en us-east-2 y verificado
  por HTTPS; el gasto real del evento debe registrarse al retirarlo.

![Captura real del presupuesto de USD 5](budget.png)

## Cálculo visible

Supuestos orientativos de operación, sin impuestos ni créditos. Confirmar
tarifas vigentes de Ohio en AWS Pricing Calculator. Express Mode cobra recursos
subyacentes; contar solo la tarea Fargate subestima el total.

| Concepto | USD/hora supuesto | 24 h | 730 h |
|---|---:|---:|---:|
| CPU Fargate | 0,25 × 0,04048 = 0,01012 | 0,24288 | 7,38760 |
| Memoria Fargate | 0,5 × 0,004445 = 0,0022225 | 0,05334 | 1,622425 |
| ALB | 0,0225 | 0,54 | 16,425 |
| IPv4 públicas | 3 × 0,005 = 0,015 | 0,36 | 10,95 |
| **Subtotal** | **0,0498425** | **1,19622** | **36,385025** |

Tres IPv4 supone una tarea pública y ALB en dos zonas. Faltan LCU, logs,
almacenamiento ECR y transferencia. Si se crea un NAT Gateway se debe añadir
su costo antes de continuar. Lambda y Step Functions opcionales se cotizan aparte.

Los USD 25–30/mes o USD 1/día del plan no incluyen todos los componentes
posibles. **No se garantiza gasto inferior a USD 5**: cuatro días con estos
supuestos ya suman USD 4,78 antes de variables y gasto previo. Limitar la
ventana del evento y retirar los recursos al terminar, verificando también
ALB, IPs, ECR y logs. Registrar después fecha inicial/final y gasto real.

Budgets **no es un tope automático**. El spend limit es una configuración
distinta: AWS Settings > Billing; solo el propietario puede modificarlo.

Fuentes: [Fargate](https://aws.amazon.com/fargate/pricing/),
[ALB](https://aws.amazon.com/elasticloadbalancing/pricing/),
[IPv4](https://aws.amazon.com/vpc/pricing/),
[recursos de Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html).

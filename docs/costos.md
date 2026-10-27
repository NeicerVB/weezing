# Declaración de costos

Estimación de infraestructura propuesta, USD, revisada el 27 de octubre de 2026. Región de origen `us-east-1`, CloudFront global con `PriceClass_100`. No se incluye dominio propio, impuestos ni servicios ajenos a esta pila. Las simulaciones se calculan en el navegador; no consumen Lambda, Fargate, Batch, Bedrock ni SageMaker.

## Cálculo mensual de referencia

Hipótesis: 0.01 GB almacenados, 1 GB servido por CloudFront al mes, 100000 solicitudes HTTPS, 100000 GET al origen como cota conservadora sin caché, 1000 PUT/LIST y menos de 1000 rutas de invalidación. El build actual es menor a 1 MB, pero se reserva espacio para versiones anteriores. Esta tabla es un presupuesto bruto sin créditos ni franquicias.

| Concepto | Cálculo de referencia | USD/mes |
| --- | --- | ---: |
| S3 Standard us-east-1 | 0.01 GB × 0.023 USD/GB-mes | 0.00023 |
| S3 PUT/LIST | 1000 / 1000 × 0.005 USD | 0.00500 |
| S3 GET | 100000 / 1000 × 0.0004 USD | 0.04000 |
| CloudFront transferencia, tarifa referencia US/Europa | 1 GB × 0.085 USD/GB | 0.08500 |
| CloudFront HTTPS, tarifa referencia US/Europa | 100000 / 10000 × 0.01 USD | 0.10000 |
| Invalidaciones | Menos de 1000 rutas mensuales de la cuenta | 0.00000 |
| Cómputo de simulación AWS | No utilizado | 0.00000 |
| **Total bruto de referencia** | Suma anterior | **0.23023** |

La facturación de CloudFront depende de puntos de presencia y franquicias disponibles en la cuenta. La estimación usa tarifas de referencia y no garantiza el cargo real desde cualquier ubicación. Con franquicia de CloudFront suficiente y sin aplicar créditos a S3, la referencia se reduce a aproximadamente USD 0.04523/mes. Los planes de tarifa plana son otra opción, pero la plantilla no los configura. Revisar precios y elegibilidad antes de desplegar. Un AWS Budget alerta, no detiene automáticamente los gastos.

Fuentes oficiales: [S3 pricing](https://aws.amazon.com/s3/pricing/), [CloudFront pago por uso](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/), [planes de tarifa plana](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html). Las tarifas de S3 deben confirmarse seleccionando US East (N. Virginia) en la tabla o calculadora oficial.

## Gasto real del evento

En la revisión visual de la consola, el Budget mensual `Spookython-Budget`, límite USD 5, mostraba **USD 0.00** de costo acumulado. Es una observación del panel de cuenta antes del despliegue, no el costo final de esta aplicación; la facturación puede actualizarse con retraso. La sesión AWS CLI ya fue autenticada, pero la organización denegó `cloudformation:ValidateTemplate` mediante una SCP al intentar desplegar en `us-east-1`. El proceso se detuvo sin crear recursos de esta aplicación.

Alertas existentes observadas: gasto real >85%, previsión >100% y gasto real >100%. El destinatario aparece **Inactive / 0 de 1 verificado**. Completar la verificación del correo y conservar captura real del Budget y las alertas en `docs/budget.png` antes de entregar. No se ha generado una captura ficticia.

Al finalizar el evento, sustituir esta observación preliminar por importe real de Cost Explorer/Billing para el periodo del evento y adjuntar evidencia. Separar costo atribuible al proyecto de otros recursos de la cuenta. No afirmar que el evento completo costó cero a partir de un panel preliminar.

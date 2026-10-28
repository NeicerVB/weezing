# Pitch: cinco minutos + tres de preguntas

Guion de trabajo, no sustituye el PDF/PPT final. No presentar como terminados la publicación AWS, la verificación de correo ni el gasto final hasta comprobarlos.

## 1. Problema — 40 segundos

Con recursos limitados, importa tanto cuántas dosis tenemos como dónde las usamos. Queremos comparar decisiones antes de ejecutarlas: ¿proteger al azar o priorizar personas con muchos contactos?

## 2. Propuesta — 50 segundos

Mostrar la ciudad 3D y señalar los cuatro estados SEIR. El mapa es conceptual y la red es sintética; los casos agregados de Manta aportan contexto. Girar cámara, inspeccionar un nodo y avanzar del día cero al siete.

## 3. Método — 70 segundos

900 personas, 12 infecciosos iniciales, siete días, 90 vacunas, eficacia idealizada 90%. Tres políticas en la misma red: ninguna, azar y mayor grado. Cuarenta réplicas con semillas emparejadas. Explicar una arista y por qué un nodo de mayor grado puede conectar más personas. Vacunación preventiva antes del día cero.

## 4. Evidencia — 70 segundos

Con la semilla 42: 72.35 infectados medios sin intervención, 64.325 al azar y 50.15 con estrategia dirigida. Con las mismas 90 dosis, se evitan 8.025 y 22.2 infecciones respectivamente. Mostrar percentiles y aclarar que no son muertes evitadas ni una predicción sanitaria. Cambiar a cero dosis y comprobar que las tres curvas coinciden. Restaurar configuración para la demo.

## 5. Arquitectura, costos y límites — 50 segundos

Mostrar arquitectura: S3 privado, CloudFront público, simulaciones en Web Worker del navegador. Estimación mensual con cálculo visible; mostrar el costo real actualizado por separado. Abrir la URL AWS comprobada y Budget con destinatario verificado. Reconocer red sintética, vacuna inmediata y ausencia de calibración clínica en el motor de red.

## 6. Cierre — 20 segundos

El valor es una comparación explicable y reproducible con el mismo presupuesto. Siguientes pasos: validar datos, modelar retraso de vacunación, movilidad real y estrategias adaptativas. No afirmar optimalidad global de la heurística de grado.

## Preguntas previsibles

- ¿Por qué esos parámetros? Son hipótesis didácticas editables, documentadas; la serie observada no los calibra.
- ¿Qué significa salvar? Evitar una infección dentro del horizonte, medido por diferencias emparejadas; no estimamos muertes.
- ¿La vista es Manta real? No: tres zonas conceptuales. Solo el extracto de notificaciones es el dato local previo.
- ¿Qué corre en AWS? El hosting HTTPS mediante CloudFront y S3; las réplicas corren localmente en el navegador.
- ¿Siempre gana la dirigida? No se garantiza; probar otras semillas, presupuestos y horizontes.
- ¿Cómo reproducir? `npm ci`, `npm test`, `node scripts/experiment.js` o cargar los mismos parámetros y semilla.

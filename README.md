# Manta Outbreak Lab

Laboratorio epidemiológico web con una ciudad 3D navegable: simula SIR o SEIR sobre una red de contactos sintética y compara vacunación por centralidad de grado con dos líneas base, **no intervenir** y **vacunar al azar con las mismas dosis**. Permite reproducir el brote día a día, cambiar parámetros y exportar configuración, red, trayectorias y métricas como JSON.

La meta es cuantificar **infecciones evitadas**, no afirmar muertes evitadas. La visualización se inspira en un juego de estrategia; los contactos y las zonas son sintéticos y no representan un mapa real de Manta.

## Ejecutar localmente

Requisitos: Node.js 22.12 o posterior, npm y un navegador moderno. Python 3 solo es necesario para regenerar el extracto de datos y los scripts históricos.

```powershell
npm ci
npm run dev
```

Abrir la dirección que indique Vite, normalmente **http://127.0.0.1:5173/**. Arrastrar para girar, rueda para acercar y pasar el puntero por personas para inspeccionar estado y contactos. Pulsar comparar después de modificar parámetros; después usar el botón de reproducción o deslizador de días. La vista muestra la réplica 1, las métricas promedian todas las réplicas.

## Pruebas y reproducción

```powershell
npm test
npm run build
node scripts/experiment.js
```

La última orden regenera [resultado-referencia.json](docs/resultado-referencia.json). Con las dependencias fijadas en `package-lock.json`, la misma configuración y semilla produce la misma red, trayectorias y resumen en Node y navegador. No cambiar la configuración entre comparaciones de estrategias.

| Parámetro | Valor por defecto | Justificación |
| --- | --- | --- |
| Modelo | SEIR sobre grafo fijo | Explorar latencia antes de infectividad |
| Personas | 900 | Población sintética pequeña para demo interactiva |
| Infectados iniciales | 12 | Hipótesis del escenario, elegidos con semilla |
| β | 0.65/día, normalizado por grado medio | Hipótesis editable, sin calibración clínica |
| Duración infecciosa media | 7 días | Hipótesis didáctica |
| Duración latente media | 4 días | Hipótesis didáctica |
| Vacunas | 90 dosis al inicio | Presupuesto de 10% de la población |
| Eficacia inmediata | 90% | Hipótesis idealizada, no pauta real de vacuna |
| Horizonte | 7 días | Semana solicitada; editable hasta 60 días |
| Réplicas | 40 por estrategia | Balance entre variabilidad y rapidez de la demo |
| Semilla | 42 | Reproducción exacta del escenario |
| Fecha de contexto | 2021-03-15 | Datos observados del 15 al 21 de marzo |
| Zonas | 3 | Zonas abstractas; no parroquias reales |
| Integración | 4 pasos diarios simultáneos | Evita cascadas artificiales por orden de recorrido |

Resultado de referencia del escenario sintético en siete días:

| Política | Infectados acumulados medios, incluidos los iniciales | Infecciones evitadas medias | Dosis |
| --- | ---: | ---: | ---: |
| No intervenir | 72.35 | 0 | 0 |
| Al azar | 64.325 | 8.025 | 90 |
| Por grado | 50.15 | 22.2 | 90 |

Para la dirigida, el rango P10–P90 de diferencias emparejadas es 10.9–36. Son estadísticas del experimento, no una predicción de Manta ni un intervalo de confianza clínico. La heurística no garantiza el óptimo ni que gane en toda configuración.

## Datos, supuestos y decisiones

Los datos históricos de Manta proceden del CSV agregado ya generado por el proyecto. [El manifiesto de origen](public/data/source.json) registra su huella SHA-256; el extracto se regenera con `python scripts/export-data.py`. En la semana por defecto hay 104 notificaciones en ese archivo, mostradas como contexto y sin equipararlas a infectados activos.

La red, posiciones, β, vacuna y estados iniciales son supuestos. El motor web no hereda la calibración del motor Python. La fecha selecciona contexto observado; no modifica parámetros automáticamente. Antes de presentar el extracto como validado hay que revisar las fechas del extractor original: contiene fechas posteriores al corte sugerido por el nombre del archivo fuente. Ver [modelo, ecuaciones, método y limitaciones](docs/modelo.md).

Vacunación por grado y al azar consumen exactamente K dosis entre susceptibles, antes de empezar. Se supone identificación perfecta de susceptibles y conocimiento de contactos. Una vacuna fallida también consume una dosis. R agrupa recuperados e inmunizados; la variable `ever` permite contar infecciones sin confundirlas con vacunados.

Se separa el motor del render y del DOM; un Web Worker calcula Monte Carlo y Three.js renderiza las personas mediante instancias. Las tres políticas reutilizan red, casos iniciales y aleatoriedad emparejada. Se reportan medias y percentiles sin ocultar diferencias negativas. La incertidumbre de red, de parámetros y del subregistro no está incluida. El horizonte corto no determina el tamaño final del brote. No hay intervención adaptativa ni mortalidad modelada.

## Arquitectura y despliegue AWS

[Diagrama SVG](docs/arquitectura.svg) · [fuente Mermaid](docs/arquitectura.mmd) · [plantilla CloudFormation](infra/template.yaml).

![Arquitectura](docs/arquitectura.svg)

S3 privado almacena el build y los datos agregados; CloudFront entrega la aplicación mediante HTTPS público con Origin Access Control. Las simulaciones corren en el navegador, no en Lambda ni Batch. Los resultados se descargan localmente y no se envían a AWS. El bundle y el extracto agregado son públicos. Los scripts históricos y el archivo original no se suben al bucket.

```powershell
aws login --profile manta
# El proyecto Idea Launchpad usa us-east-2.
aws sts get-caller-identity --profile manta
powershell -ExecutionPolicy Bypass -File .\infra\deploy.ps1 -Profile manta -Region us-east-2
```

Requiere permisos en CloudFormation, S3 y CloudFront para los recursos de la plantilla. El script valida identidad, ejecuta pruebas y build, despliega y devuelve la URL. No modifica IAM ni crea claves. Si el usuario utiliza IAM Identity Center, seguir su flujo `aws configure sso` / `aws sso login` en lugar de `aws login`.

En Windows, detener primero el servidor de desarrollo con Ctrl+C antes del despliegue: `npm ci` reinstala dependencias y no puede reemplazar módulos nativos que Vite tenga abiertos.

**URL pública AWS: pendiente.** La sesión `manta` está autenticada. Idea Launchpad confirmó la región `us-east-2`, donde la validación CloudFormation terminó correctamente. El rechazo anterior ocurrió en `us-east-1`; no se modificaron las políticas administradas ni se crearon recursos. Ver [configuración de Agent Toolkit](docs/aws-toolkit.md). Después del despliegue, incorporar la URL real, probarla desde una ventana privada y mantener la pila activa hasta el pitch. La plantilla retiene el bucket si se elimina la pila para evitar borrar contenido accidentalmente.

## Costos y AWS Budget

[Declaración de costos y cálculo mensual](docs/costos.md). Estimación bruta de referencia de USD 0.23023/mes bajo las hipótesis documentadas, antes de franquicias e impuestos; no es el gasto final del evento.

Se observó un Budget real `Spookython-Budget` de USD 5/mes, con alertas a 85% real, 100% previsto y 100% real. **El destinatario de correo requiere verificación.** La captura real con alerta debe guardarse como `docs/budget.png` y enlazarse aquí antes de entregar. Captura pendiente de incorporar; no se incluye una imagen de muestra como evidencia.

## Entregables del concurso

El remoto configurado es `https://github.com/NeicerVB/weezing`; verificar que sea público y publicar los commits locales antes de entregar. No se ha cambiado su visibilidad ni se han enviado archivos automáticamente.

- Código, pruebas, interfaz y documentación: incluidos en esta versión.
- Historial: conservar commits reales de desarrollo; no reescribir fechas ni fabricar trabajo anterior.
- Arquitectura: SVG y fuente Mermaid incluidos.
- Costos: estimación y observación preliminar incluidas; cerrar importe real al final del evento.
- AWS: Agent Toolkit configurado y plantilla validada en us-east-2; despliegue y URL pública pendientes.
- Budget: configuración observada; verificar destinatario e incorporar captura real.
- Pitch: [presentación PDF de seis diapositivas](docs/pitch.pdf), [guion de cinco minutos](docs/pitch.md) y [generador editable](scripts/build-pitch.py). Revisar identidad del equipo, estado AWS y cifras finales antes de entregar. Regenerar con `python scripts/build-pitch.py` (requiere `pip install reportlab`).
- Video: opcional, pendiente si el equipo decide grabarlo.

Según las instrucciones facilitadas: entrega el **miércoles 28 de octubre de 2026 a las 10:00, hora de Ecuador continental**; demo el **viernes 30 de octubre**, ULEAM, cinco minutos y tres de preguntas. La región `us-east-1` debe confirmarse con la organización.

## Estructura

```text
src/                     motor, Web Worker, interfaz y escena 3D
tests/                   pruebas del motor
public/data/             extracto agregado público y manifiesto
scripts/                 exportación de datos y experimento reproducible
infra/                   CloudFormation y despliegue PowerShell
docs/                    arquitectura, costos, método y pitch
simulador_epidemiologico.py  simulador Python previo (independiente)
Extración de datos/       análisis y archivos históricos existentes
```

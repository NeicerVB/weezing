# Modelo y decisiones de diseño

## Separación entre datos e hipótesis

El extracto agregado `public/data/manta.json` proviene del `casos_diarios_manta.csv` existente en el repositorio. `public/data/source.json` conserva ruta, SHA-256, intervalo y cantidad de días. Se regenera con `python scripts/export-data.py`, sin dependencias externas.

El extractor previo filtra cantón Manta y `clasificacion_final=confirmado`, cuenta filas y usa `fecha_notificacion` con `dayfirst=True, format='mixed'`. Esto requiere validar duplicados y formatos contra el archivo original antes de defender la serie como dato validado. Hay fechas hasta diciembre de 2022 en un archivo cuyo nombre sugiere corte abril de 2022: una señal concreta para revisar el parseo, sin alterar silenciosamente los datos existentes. Los días faltantes fueron rellenados con cero por ese extractor; cero no garantiza ausencia real de casos. La aplicación identifica el contenido como notificaciones observadas y no lo usa para ajustar parámetros.

La semana por defecto suma 104 notificaciones en ese extracto. No se compara directamente con el conteo de infecciones de 900 individuos sintéticos ni se escala a la población total de Manta. La fecha solo selecciona contexto histórico; no calibra automáticamente el experimento.

## Población y contactos

Cada nodo es una persona sintética. Hay tres zonas de visualización sin equivalencia demográfica con parroquias reales. Se generan grupos de hasta cuatro personas dentro de la misma zona, aristas a centros de actividad y dos intentos de contacto aleatorio por nodo. Las aristas repetidas y bucles se eliminan. La red es no dirigida y permanece fija durante el experimento. La posición 3D no determina la infección.

La heurística ordena a los susceptibles por grado, con desempate aleatorio reproducible. Es una estrategia razonable de centralidad local, no una optimización global ni una garantía de que siempre gane. Se asume conocimiento completo de los contactos y de quién es susceptible; en la realidad ese conocimiento cuesta y puede ser incompleto.

## Transiciones

SIR usa S → I → R; SEIR usa S → E → I → R. No hay demografía, reinfección ni mortalidad separada. R contiene recuperados y vacunados efectivamente inmunizados; la variable `ever` cuenta exclusivamente personas que alguna vez estuvieron infectadas, incluidos los infectados iniciales.

Se usan cuatro pasos simultáneos por día (`dt=0.25`). Para un susceptible i, con k vecinos infecciosos y grado medio g de la red:

```
fuerza_i = beta * k / g
P(S→E o I) = 1 - exp(-fuerza_i * dt)
P(E→I) = 1 - exp(-dt / latentDays)
P(I→R) = 1 - exp(-dt / infectiousDays)
```

Los cambios se aplican después de calcular todos los eventos del subpaso, evitando que el orden de los nodos produzca contagios encadenados dentro del mismo instante. β está en unidades diarias, normalizada por el grado medio; no es una probabilidad por contacto. Los tiempos son exponenciales, no duraciones fijas.

## Recursos e intervención

Una dosis equivale a una unidad de presupuesto; K dosis disponibles antes del día 0. Ambas políticas vacunales consumen exactamente K dosis en susceptibles y comparten eficacia. La vacunación es preventiva e inmediatamente efectiva con probabilidad `efficacy`. No hay nuevas entregas ni decisiones adaptativas. Una dosis fallida también consume presupuesto.

Es una intervención idealizada: las vacunas reales tienen retrasos, múltiples dosis y otros efectos. Los valores por defecto son hipótesis didácticas, no estimaciones clínicas. El simulador inicial de Python y sus parámetros no se consideran una calibración del nuevo motor de red.

## Comparación justa y reproducibilidad

La red y los infectados iniciales se generan una vez con la semilla principal y se reutilizan en todas las réplicas. Cada réplica usa una semilla epidémica derivada. Las políticas comparten números pseudoaleatorios indexados por réplica, día, subpaso, nodo y tipo de evento. De este modo, que una política haga menos transiciones no desplaza el flujo aleatorio de las otras. La secuencia es de 32 bits y está implementada en JS para navegador y Node.

Se reporta la media y percentiles 10–90 de infectados activos por día. El impacto es la diferencia emparejada:

```
evitadas[r, política] = infectados_acumulados[r, ninguna]
                      - infectados_acumulados[r, política]
```

Los percentiles del impacto se calculan sobre esas diferencias, no restando percentiles de grupos distintos. No se recortan resultados negativos. El rango describe variación del brote con red/parámetros fijos; no es intervalo de confianza ni incluye incertidumbre de datos o estructura.

La vista 3D reproduce la primera réplica; la gráfica y tarjetas agregan todas. Es importante señalarlo durante la demo. El horizonte de siete días es corto para SEIR y no mide el tamaño final del brote; puede cambiarse hasta 60 días.

## Arquitectura y pruebas

El motor es independiente de Three.js y del DOM. Un Web Worker ejecuta Monte Carlo para no bloquear la cámara. La escena usa instancias geométricas para limitar llamadas a la GPU. Las pruebas en Node cubren conservación, reproducibilidad, presupuestos, protección total, eficacia nula, ausencia de contagio con β=0 y selección por grado.

Los cálculos ocurren en el equipo del visitante. AWS sirve los archivos estáticos mediante S3 privado y CloudFront; no se afirma que las réplicas corran en paralelo en AWS. La interfaz puede usarse en un móvil moderno, pero requiere WebGL para la escena. Si WebGL no está disponible, el motor y las métricas siguen disponibles.

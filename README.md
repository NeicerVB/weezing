# weezing — autómata SEIR sobre grafos

Simulación discreta de cuatro estados (`S`, `E`, `I`, `R`) sobre un grafo no dirigido sintético o cargado desde archivo. Un nodo avanza como máximo una vez por día y todos los cambios del día se aplican juntos. Solo usa la biblioteca estándar de Python; no requiere instalar nada para ejecutarlo desde este directorio.

Es un modelo abstracto de difusión en redes, no un modelo epidemiológico calibrado. Los valores de `beta`, `sigma` y `gamma` son supuestos computacionales entre 0 y 1.

## Ejecutar

```bash
python -m seir.cli --n 500 --days 30 --beta 0.03 --sigma 0.2 --gamma 0.1 \
  --degree 6 --seed 42 --e0 5 --i0 3
```

La tabla incluye el día 0 (foto inicial) y los 30 pasos siguientes. Para JSON:

```bash
python -m seir.cli --n 500 --days 30 --beta 0.03 --sigma 0.2 --gamma 0.1 \
  --seed 42 --e0 5 --i0 3 --format json
```

La misma configuración y semilla producen exactamente la misma salida.

| Parámetro | Significado |
| --- | --- |
| `--n` | Número de nodos, identificados `0 .. n-1`. Se infiere de `--edges` si se omite. |
| `--days` | Pasos diarios después del día 0; `days >= 0`. Por defecto 30. |
| `--beta` | Probabilidad abstracta por enlace activo y día. |
| `--sigma` | Probabilidad diaria `E → I`. |
| `--gamma` | Probabilidad diaria `I → R`. |
| `--seed` | Semilla de la topología, de los IDs iniciales y de cada sorteo. Por defecto 0. |
| `--degree` | Grado promedio objetivo del grafo generado. Por defecto 6. |
| `--edges` | CSV/TSV con aristas; tiene prioridad sobre `--degree`. |
| `--e0`, `--i0`, `--r0` | Recuentos iniciales; si se omite el recuento, se deduce de los IDs dados. |
| `--init-e`, `--init-i`, `--init-r` | IDs concretos separados por comas, p. ej. `--init-i 7,8,9`. |
| `--format` | `table` (predeterminado) o `json`. |

## Grafo explícito

Cada arista debe aparecer en ambos sentidos; la carga rechaza asimetrías, bucles e IDs fuera de rango. Se admiten comas o tabuladores, líneas vacías y la cabecera `a,b`.

```text
a,b
0,1
1,0
1,2
2,1
```

```bash
python -m seir.cli --edges red.csv --days 10 --beta 0.2 --sigma 0.5 --gamma 0.3 --init-i 0
```

## Reglas del modelo

- Un nodo `S` con `k` vecinos en `I` al inicio del día pasa a `E` con probabilidad `1 - (1 - beta)^k`.
- Cada nodo que ya estaba en `E` pasa a `I` con `sigma`; cada uno que ya estaba en `I` pasa a `R` con `gamma`.
- Las transiciones se calculan sobre una instantánea y se aplican al final: un `E` nuevo no progresa ese día y un `I` nuevo no expone a nadie hasta el siguiente.
- `new_s_to_e` cuenta solo las transiciones `S → E` del paso; `cumulative` arranca en `E0 + I0` y suma esas transiciones. `R0` no suma.

## Comprobar

```bash
python -m unittest discover -s tests -v
```

Con pytest instalado también funciona `python -m pytest`; no es una dependencia de ejecución. Las pruebas cubren conservación `S + E + I + R = N`, casos límite, reproducibilidad, independencia del orden de iteración y grafos explícitos.

## Límites

No modela síntomas, detección, heterogeneidad por edad, reinfección, intervenciones ni datos clínicos o del mundo real. La red es sintética o provista por el usuario; el resultado es una simulación computacional de difusión sobre grafos y no permite predecir brotes ni tomar decisiones sanitarias.

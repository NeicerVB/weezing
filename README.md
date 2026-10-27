# weezing — demostración SEIR agregada

Simulación didáctica de cuatro compartimentos (S, E, I, R) con salida diaria reproducible. Solo usa la biblioteca estándar de Python; no requiere instalar el paquete para ejecutarlo desde este directorio.

## Ejecutar

```bash
python -m seir.cli --n 500 --days 30 --beta 0.03 --sigma 0.2 --gamma 0.1 --seed 42 --e0 5 --i0 3
```

La salida predeterminada es una tabla con el día 0 y los 30 días siguientes. Añade `--format json` para obtener un objeto con `meta` (parámetros efectivos) y `days` (los registros). La misma configuración y semilla producen exactamente la misma salida.

| Parámetro | Significado |
| --- | --- |
| `--n`, `--days` | Población total y número de pasos; `n > 0`, `days >= 0`. |
| `--beta` | Mezcla homogénea abstracta diaria entre 0 y 1. |
| `--sigma`, `--gamma` | Probabilidad diaria E→I e I→R, entre 0 y 1. |
| `--e0`, `--i0`, `--r0` | Recuentos iniciales, por defecto 0; S inicial es el resto. |
| `--seed` | Semilla de los sorteos, por defecto 0. |

Cada día se calculan las transiciones desde los recuentos al inicio de ese día: la probabilidad abstracta de S→E es `beta × I / N`. Los nuevos E no avanzan ni contribuyen a nuevas exposiciones ese mismo día. `new_s_to_e` cuenta solo las transiciones de ese día; `cumulative` empieza en `E0 + I0` y suma esas transiciones, sin incluir `R0`.

## Comprobar

```bash
python -m unittest discover -s tests -v
```

Si pytest ya está disponible, también funciona `python -m pytest`. No es una dependencia de ejecución.

## Alcance y límites

Esta versión **no implementa** la difusión nodo a nodo del plan, generación/carga de grafos (`--degree`, `--edges`), selección de IDs, intervención ni comparación de estrategias. Solo ofrece una trayectoria agregada sintética: no modela contactos individuales, heterogeneidad, reinfección ni datos del mundo real. Los parámetros son supuestos computacionales, no estimaciones sanitarias; los resultados no permiten predecir brotes ni aconsejar decisiones médicas.

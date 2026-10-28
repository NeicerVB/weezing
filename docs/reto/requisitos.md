CADA EQUIPO DECIDE
- La plaga: inspirada en una enfermedad real (dengue, influenza, sarampión, COVID, cólera) o inventada; transmisión, incubación, contagio, si mata o convierte.
- La población: red de contactos de Manta generada por ellos (hogares, colegios, buses, mercados, barrios) o con datos abiertos (INEC, Ministerio de Salud).
- El modelo: SIR, SEIR, basado en agentes, sobre grafo o por barrios.
- Las intervenciones: vacunas, cuarentenas, cierre de lugares, fumigación, antídotos, campañas.
- Los recursos: cuántos hay, si llegan por días, cuánto cuestan.
- La estrategia: centralidad en el grafo, algoritmos voraces, optimización, simulaciones, aprendizaje por refuerzo o heurística propia.

ESTADOS SUGERIDOS: 🟢 Sano (susceptible) · 🟡 Mordido (expuesto) · 🔴 Zombie (infeccioso) · 🔵 Exorcizado (recuperado o inmune).

EL SISTEMA DEBE
1. Simular la propagación día a día.
2. Aplicar al menos una intervención con recursos limitados.
3. Comparar su estrategia contra dos líneas base: no intervenir e intervenir al azar con los mismos recursos.
4. Repetir la simulación muchas veces y reportar promedios y rangos.
5. Tener una interfaz para cambiar los parámetros principales (contagio, vacunas, punto de inicio) y ver el resultado.
6. Ser reproducible: misma configuración y semilla, mismo resultado.
7. Estar desplegado en AWS.
8. Documentar en el README cada supuesto y de dónde salen los números.

NIVEL BASE 🟢
- Modelo SIR o SEIR sobre una red de contactos, una intervención (por ejemplo K vacunas) y una estrategia razonable comparada con las dos líneas base.
- Gráfica de la curva de contagios y resumen de cuántos se salvan.

NIVEL PRO 🔴 (puntos extra)
- Varias intervenciones combinadas con costos y un presupuesto total.
- Recursos que llegan por días y decisiones que cambian según el brote.
- Miles de simulaciones en paralelo en AWS (Monte Carlo).
- Calibración con datos reales (por ejemplo dengue en Manabí).
- Mapa animado del avance de la plaga.
- Informe para el alcalde en lenguaje simple.

IDEAS DE DIRECCIÓN (opcionales): vacunación estratégica, reparto de antídotos, cuarentena inteligente, plaga por mosquito con brigadas de fumigación, rastreo del paciente cero, hospital saturado.
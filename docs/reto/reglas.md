ENTORNO
- Cada equipo DEBE trabajar en una cuenta AWS propia (o la sandbox que entregue la organización) en la región us-east-1 (por confirmar).
- La cuenta DEBE tener un AWS Budget con alerta desde el primer día (captura en el README).
- Se permite usar asistentes de IA para programar, pero el equipo DEBE poder explicar cualquier parte de su código.
- Lenguajes y frameworks libres.

CÓMO LEER EL RETO
- DEBE: obligatorio. Si no se cumple, ese criterio vale 0.
- DEBERÍA: esperado. No cumplirlo resta, pero no anula.
- PUEDE: opcional. Suma puntos si está bien hecho.

RÚBRICA BASE (sobre 10)
- Prueba de fuego (40 %): resultado de la prueba del track, en escala 0–10.
- Calidad técnica (25 %): arquitectura adecuada, seguridad básica (sin llaves en el código, mínimo privilegio), código legible.
- Producto (15 %): que una persona real pueda usarlo sin explicación.
- Costos (10 %): declaración de costos coherente con lo que muestra la cuenta.
- Presentación (10 %): claridad, respeto del tiempo y respuestas a preguntas.
En caso de empate gana el equipo con mejor prueba de fuego; si persiste, el de menor costo declarado.

PRUEBA DE FUEGO (Track B)
1. Presentación del escenario: plaga, población, supuestos y estrategia.
2. Verificación: el jurado corre la simulación en vivo con una semilla que elige y comprueba que la estrategia supera a las líneas base.
3. 🎃 Brote Sorpresa: el jurado cambia las condiciones (por ejemplo: el doble de contagiosa, la mitad de las vacunas, el brote empieza en el mercado, una variante que la vacuna cubre a medias). El equipo tiene 5 minutos para ajustar y mostrar la nueva recomendación.

Puntuación (0–10): Impacto de la estrategia 30 % · Rigor del modelo 25 % · Brote Sorpresa 25 % · Claridad para decidir 20 %.

LO QUE EL JURADO VA A BUSCAR
- Mostrar una sola simulación con buen resultado (puede ser suerte).
- No tener línea base.
- Parámetros inventados sin explicar.
- Vacunar a quien ya está infectado o es inmune.
- Un modelo tan complejo que el equipo no sabe explicar.
- Estrategias que se rompen con el Brote Sorpresa.
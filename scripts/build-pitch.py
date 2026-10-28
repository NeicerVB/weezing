"""Genera el PDF del pitch. Dependencia opcional: pip install reportlab."""
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

BASE = Path(__file__).resolve().parent.parent
reference = json.loads((BASE / "docs/resultado-referencia.json").read_text(encoding="utf-8"))
out = BASE / "docs/pitch.pdf"
c = canvas.Canvas(str(out), pagesize=(960, 540))
c.setTitle("Manta Outbreak Lab — simulación e intervenciones")
c.setAuthor("Equipo Manta Outbreak Lab")
BG, FG, MUTED, GREEN = map(HexColor, ["#0c1923", "#e8f2f6", "#9eb8c7", "#66e2bf"])


def text(x, y, value, size=18, color=FG, font="Helvetica"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, value)


def slide(number, eyebrow, title, lines):
    c.setFillColor(BG)
    c.rect(0, 0, 960, 540, fill=1, stroke=0)
    text(48, 493, "MANTA / OUTBREAK LAB", 13, GREEN, "Helvetica-Bold")
    text(48, 447, eyebrow.upper(), 11, MUTED)
    text(48, 394, title, 32, FG, "Helvetica-Bold")
    y = 327
    for line in lines:
        text(48, y, line, 18, MUTED)
        y -= 35
    text(48, 25, "Escenario sintético, inspirado en COVID. No es una predicción sanitaria.", 10, MUTED)
    text(883, 25, f"{number:02}/06", 10, GREEN)


slide(1, "El problema", "Recursos limitados. Decisiones que importan.", [
    "¿Dónde usar 90 dosis para reducir un brote?",
    "Una población sintética de 900 personas conectadas por contactos.",
    "Un laboratorio 3D para ver, comparar y explicar las decisiones.",
    "Medimos infecciones evitadas; no estimamos muertes evitadas.",
])
c.showPage()
slide(2, "La experiencia", "Una ciudad que puedes explorar.", [
    "Gira la cámara y observa personas susceptibles, expuestas e infecciosas.",
    "Avanza del día 0 al día 7 y alterna entre las tres estrategias.",
    "Cambia transmisión, vacunas, duración, infectados iniciales y semilla.",
    "Los datos agregados de Manta aportan contexto histórico.",
    "La ciudad, la red y los parámetros del brote son hipótesis sintéticas.",
])
c.showPage()
slide(3, "El experimento", "Tres políticas. Una comparación justa.", [
    "1. No intervenir.",
    "2. Vacunar al azar con 90 dosis.",
    "3. Vacunar por grado: priorizar personas con más contactos.",
    "SEIR · beta 0.65/día · latencia 4 días · infecciosidad 7 días.",
    "40 réplicas · semilla 42 · misma red e infectados iniciales.",
    "Vacunación preventiva con eficacia inmediata idealizada del 90%.",
])
c.showPage()
slide(4, "Resultados reproducibles", "Mismo presupuesto. Mayor impacto observado.", [])
metrics = reference["metrics"]
for i, (key, label, color) in enumerate([
    ("none", "Sin intervención", "#ff647c"),
    ("random", "Al azar", "#e9b961"),
    ("degree", "Por grado", "#56d9be"),
]):
    y = 315 - i * 65
    value = metrics[key]["infected"]["mean"]
    text(48, y, label, 16, MUTED)
    c.setFillColor(HexColor(color))
    c.roundRect(235, y - 6, value * 6, 26, 4, stroke=0, fill=1)
    text(700, y, f"{value:.2f} infectados", 17)
text(48, 86, "Dirigida: 22.2 infecciones evitadas medias; al azar: 8.025. Ambas usan 90 dosis.", 17, GREEN)
text(48, 57, "Dirigida P10–P90: 10.9 a 36. Rango del experimento, no intervalo clínico.", 13, MUTED)
c.showPage()
slide(5, "Arquitectura y costos", "Interactividad sin servidores permanentes.", [
    "S3 privado  >  CloudFront público HTTPS  >  navegador del visitante.",
    "Web Worker ejecuta Monte Carlo; Three.js renderiza la escena 3D.",
    "Resultados descargables como JSON con semilla y configuración.",
    "Estimación bruta de referencia: USD 0.23023/mes, antes de franquicias.",
    "Budget real: USD 5/mes; la verificación del destinatario está pendiente.",
    "Plantilla validada en us-east-2; publicación y URL AWS pendientes.",
])
c.showPage()
slide(6, "Límites y siguiente paso", "Explicable. Medible. Reproducible.", [
    "La estrategia de grado es una heurística; no garantiza el óptimo.",
    "Red sintética; vacunación inmediata; sin mortalidad ni subregistro.",
    "Los datos históricos no calibran automáticamente este motor.",
    "Siguiente paso: validar fechas, retrasos vacunales y movilidad real.",
    "Demo: probar cero dosis para comprobar que las curvas coinciden.",
    "Reproducción: npm ci / npm test / node scripts/experiment.js",
])
c.showPage()
c.save()
print(f"PDF generado: {out} ({out.stat().st_size} bytes)")

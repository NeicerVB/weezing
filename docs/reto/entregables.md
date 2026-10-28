Todo se entrega en la plataforma (Mi equipo → Entrega) hasta el miércoles 28 de octubre a las 10:00 (hora de Ecuador). Lo que llegue después no se evalúa.

LISTA DE ENTREGABLES
- Repositorio público (GitHub, GitLab o Bitbucket) con el código completo y un historial de commits real, no un solo commit final.
- README en la raíz con: qué hace el proyecto, cómo desplegarlo, cómo probarlo, decisiones de diseño, limitaciones conocidas y la captura del AWS Budget con alerta.
- Diagrama de arquitectura dentro del repositorio y enlazado desde el README: servicios de AWS usados, flujo de datos y qué partes son públicas. Herramienta libre: draw.io (diagrams.net), Excalidraw, Lucidchart, Cloudcraft, AWS Infrastructure Composer o Mermaid. Suban la imagen (PNG o SVG) y, si existe, el archivo fuente (por ejemplo .drawio).
- Declaración de costos en el README o en docs/costos.md: cuánto costaría operar el sistema al mes, con el cálculo visible, y cuánto se gastó realmente durante el evento.
- Aplicación desplegada en AWS con una URL pública que funcione hasta el día del pitch.
- Presentación del pitch (PDF, PPT o PPTX, máximo 20 MB).
- Video de demostración (opcional): enlace público.
- Track B: parámetros por defecto y semilla documentados en el README para reproducir los resultados.

ESTRUCTURA SUGERIDA DEL REPOSITORIO
README.md
docs/arquitectura.png (o .svg) y docs/arquitectura.drawio
docs/costos.md
docs/budget.png
src/
infra/ (opcional: CDK, SAM o Terraform)

DEMO EN VIVO
Viernes 30 de octubre en la ULEAM: 5 minutos de pitch + 3 minutos de preguntas del jurado.
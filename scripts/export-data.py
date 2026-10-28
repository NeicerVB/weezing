"""Regenera el extracto web sin modificar el archivo original."""
import csv
import hashlib
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
candidates = list(BASE.rglob("casos_diarios_manta.csv"))
if len(candidates) != 1:
    raise SystemExit("Se requiere un único casos_diarios_manta.csv dentro del proyecto")
source = candidates[0]
with source.open(encoding="utf-8-sig", newline="") as stream:
    rows = [{"date": r["fecha"], "cases": int(r["casos_nuevos"])} for r in csv.DictReader(stream)]
out = BASE / "public" / "data"
out.mkdir(parents=True, exist_ok=True)
(out / "manta.json").write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
manifest = {"source": source.relative_to(BASE).as_posix(), "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "rows": len(rows), "first": min(r["date"] for r in rows), "last": max(r["date"] for r in rows), "note": "Extracto local del proyecto; revisar parseo de fechas del extractor antes de presentar como serie epidemiológica validada."}
(out / "source.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Exportados {len(rows)} días")

from pathlib import Path
import json
import fitz

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "data" / "sources" / "examen-civique-naturalisation-questions-de-connaissance-20251212.pdf"
OUT = ROOT / "data" / "official_questions_raw.json"

if not PDF.exists():
    raise SystemExit(f"PDF not found: {PDF}")

doc = fitz.open(PDF)
items = []
current_category = None

for page_index, page in enumerate(doc, start=1):
    lines = [line.strip() for line in page.get_text("text").splitlines() if line.strip()]
    category = next((line for line in lines[:5] if line != "Intitulé de la question"), None)
    if category:
        current_category = category

    for line in lines:
        if line in {"Intitulé de la question", current_category, "?"}:
            continue
        items.append({
            "question_text": line,
            "source_category": current_category,
            "source_page": page_index,
            "source": PDF.name,
        })

OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Extracted {len(items)} source prompts to {OUT}")

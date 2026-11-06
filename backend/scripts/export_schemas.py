"""Writes contracts/schemas/*.json from app/contracts (npm run schemas). tests/contracts fails if they drift."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.contracts.models import ALL  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "contracts" / "schemas"


def schemas() -> dict[str, str]:
    return {f"{name}.v0_1.json": json.dumps(model.model_json_schema(mode="serialization"), indent=2, sort_keys=True) + "\n"
            for name, model in ALL.items()}


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for fname, text in schemas().items():
        (OUT / fname).write_text(text)
        print("wrote", OUT / fname)

"""Contract schemas must match the committed contracts/schemas/*.json (run `npm run schemas` and bump schemaVersion
when a contract changes on purpose)."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("export_schemas", ROOT / "backend" / "scripts" / "export_schemas.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def test_schemas_match_committed():
    for fname, text in mod.schemas().items():
        committed = ROOT / "contracts" / "schemas" / fname
        assert committed.exists(), f"missing {committed}; run npm run schemas"
        assert committed.read_text() == text, f"{fname} changed: run npm run schemas and bump schemaVersion"


def test_every_contract_is_versioned():
    from app.contracts.models import ALL

    for name, model in ALL.items():
        assert model.model_fields["schemaVersion"].default == "0.1", name

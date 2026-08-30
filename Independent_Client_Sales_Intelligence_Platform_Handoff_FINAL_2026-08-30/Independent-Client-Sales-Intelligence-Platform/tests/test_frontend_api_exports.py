from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web" / "src"
API = SRC / "services" / "api.js"


def _api_exports(source: str) -> set[str]:
    names = set(
        re.findall(r"\bexport\s+(?:async\s+)?function\s+(\w+)", source)
    )
    names.update(
        re.findall(r"\bexport\s+(?:const|let|var|class)\s+(\w+)", source)
    )
    return names


def _service_api_imports(source: str) -> set[str]:
    names: set[str] = set()
    pattern = re.compile(
        r'import\s*\{([^}]*)\}\s*from\s*["\']services/api["\']',
        re.S,
    )
    for match in pattern.finditer(source):
        for raw_name in match.group(1).split(","):
            raw_name = raw_name.strip()
            if not raw_name:
                continue
            names.add(re.split(r"\s+as\s+", raw_name, maxsplit=1)[0].strip())
    return names


def test_every_named_services_api_import_is_exported():
    exports = _api_exports(API.read_text(encoding="utf-8"))
    missing: list[str] = []

    for path in SRC.rglob("*"):
        if path.suffix not in {".js", ".jsx"} or path == API:
            continue
        imports = _service_api_imports(path.read_text(encoding="utf-8"))
        for name in sorted(imports - exports):
            missing.append(f"{path.relative_to(SRC)} imports missing API export {name}")

    assert not missing, "\n".join(missing)


def test_gis_api_uses_role_scoped_rpc():
    source = API.read_text(encoding="utf-8")
    assert "export async function getGisLeads()" in source
    assert 'fetchRpcPaged("platform_visible_gis_leads")' in source

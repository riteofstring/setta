import importlib.util
from pathlib import Path


_REPO_ROOT = Path(__file__).resolve().parents[2]
_HOT_RELOAD_PATH = _REPO_ROOT / "backend" / "setta" / "api" / "hot_reload.py"
_HOT_RELOAD_SPEC = importlib.util.spec_from_file_location(
    "setta_hot_reload_module",
    _HOT_RELOAD_PATH,
)
if _HOT_RELOAD_SPEC is None or _HOT_RELOAD_SPEC.loader is None:
    raise RuntimeError(f"Failed to load hot_reload module from {_HOT_RELOAD_PATH}")
_HOT_RELOAD_MODULE = importlib.util.module_from_spec(_HOT_RELOAD_SPEC)
_HOT_RELOAD_SPEC.loader.exec_module(_HOT_RELOAD_MODULE)
_WatcherSpec = _HOT_RELOAD_MODULE._WatcherSpec


def test_watcher_spec_file_patterns_match_the_file_name(tmp_path: Path) -> None:
    watched_file = (tmp_path / "callback.py").resolve()
    watched_file.write_text("# callback\n", encoding="utf-8")

    assert _WatcherSpec(
        root=watched_file,
        is_file=True,
        includes=(),
        ignores=("*.tmp",),
    ).accepts(watched_file)
    assert not _WatcherSpec(
        root=watched_file,
        is_file=True,
        includes=(),
        ignores=("*.py",),
    ).accepts(watched_file)
    assert not _WatcherSpec(
        root=watched_file,
        is_file=True,
        includes=(),
        ignores=(),
    ).accepts((tmp_path / "other.py").resolve())


def test_watcher_spec_directory_patterns_use_relative_paths(tmp_path: Path) -> None:
    watched_root = (tmp_path / "callbacks").resolve()
    nested_dir = watched_root / "nested"
    nested_dir.mkdir(parents=True)
    included_file = (nested_dir / "handler.py").resolve()
    ignored_file = (watched_root / "ignored.tmp").resolve()
    outside_file = (tmp_path / "outside.py").resolve()
    included_file.write_text("# callback\n", encoding="utf-8")
    ignored_file.write_text("ignored\n", encoding="utf-8")
    outside_file.write_text("# outside\n", encoding="utf-8")

    spec = _WatcherSpec(
        root=watched_root,
        is_file=False,
        includes=("**/*.py",),
        ignores=("*.tmp",),
    )

    assert spec.accepts(included_file)
    assert not spec.accepts(ignored_file)
    assert not spec.accepts(outside_file)

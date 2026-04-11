import contextlib
import importlib.util
import pathlib
import sys
import types

import pytest
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    LocalCoreListenerRealtimeDelta,
    LocalCoreRenderRealtimeDependencyValuesRequest,
)
from setta.types.generated.go_shared_types import (
    DependencyValueType,
    LiteralDependencyValue,
    SectionDependencyKey,
    SectionParamDependencyKey,
)
from setta.types.id import ID

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_BACKEND_ROOT = _REPO_ROOT / "backend"


@contextlib.contextmanager
def _loaded_local_core_module() -> types.ModuleType:
    added_backend_path = False
    backend_path = str(_BACKEND_ROOT)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
        added_backend_path = True

    import setta  # noqa: F401

    previous_api_module = sys.modules.get("setta.api")
    previous_local_core_module = sys.modules.get("setta.api.local_core")

    api_module = types.ModuleType("setta.api")
    api_module.__path__ = [str(_BACKEND_ROOT / "setta" / "api")]
    sys.modules["setta.api"] = api_module

    spec = importlib.util.spec_from_file_location(
        "setta.api.local_core",
        _BACKEND_ROOT / "setta" / "api" / "local_core.py",
    )
    assert spec is not None and spec.loader is not None
    local_core_module = importlib.util.module_from_spec(spec)
    sys.modules["setta.api.local_core"] = local_core_module
    try:
        spec.loader.exec_module(local_core_module)
        yield local_core_module
    finally:
        if previous_local_core_module is None:
            sys.modules.pop("setta.api.local_core", None)
        else:
            sys.modules["setta.api.local_core"] = previous_local_core_module
        if previous_api_module is None:
            sys.modules.pop("setta.api", None)
        else:
            sys.modules["setta.api"] = previous_api_module
        if added_backend_path:
            sys.path.remove(backend_path)


def _dependency_key_tuple(
    dependency_key: SectionDependencyKey | SectionParamDependencyKey,
) -> tuple[str, str, str | None]:
    return (
        dependency_key.type,
        str(dependency_key.sectionId),
        str(dependency_key.codeObjId)
        if isinstance(dependency_key, SectionParamDependencyKey)
        else None,
    )


@pytest.mark.asyncio
async def test_local_core_renders_realtime_dependency_values_via_hidden_go_cli() -> (
    None
):
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        process = None
        section_key = SectionDependencyKey(
            type="Section",
            sectionId=ID("section-config"),
        )
        param_key = SectionParamDependencyKey(
            type="SectionParam",
            sectionId=ID("section-config"),
            codeObjId=ID("count"),
        )
        try:
            result = await client.render_realtime_dependency_values(
                LocalCoreRenderRealtimeDependencyValuesRequest(
                    dependencyCatalog=ListenerDependencyCatalog(
                        entries=[
                            ListenerDependencyCatalogEntry(
                                dependencyKey=section_key,
                                name="Config",
                                fullPathName="Config",
                                dependencies=[param_key],
                                sectionType="Dict",
                            ),
                            ListenerDependencyCatalogEntry(
                                dependencyKey=param_key,
                                name="count",
                                fullPathName="Config.count",
                                codeObjType="CodeParam",
                                valueRepresentation="expression",
                            ),
                        ]
                    ),
                    currentDependencyValues=ListenerRenderedDependencyValues(
                        entries=[
                            ListenerRenderedDependencyValue(
                                dependencyKey=section_key,
                                renderedValue="{'count': 1}",
                            ),
                            ListenerRenderedDependencyValue(
                                dependencyKey=param_key,
                                renderedValue="1",
                            ),
                        ]
                    ),
                    deltas=[
                        LocalCoreListenerRealtimeDelta(
                            dependency=param_key,
                            value=LiteralDependencyValue(
                                type=DependencyValueType.Literal,
                                payload="2",
                            ),
                        )
                    ],
                )
            )
            assert client._state is not None
            process = client._state.process
        finally:
            client.close()

        assert client._state is None
        assert process is not None
        assert process.poll() is not None
        assert process.stdin is not None and process.stdin.closed
        assert process.stdout is not None and process.stdout.closed
        assert process.stderr is not None and process.stderr.closed

        by_key = {
            _dependency_key_tuple(entry.dependencyKey): entry.renderedValue
            for entry in result.dependencyValues.entries
        }
        assert by_key[_dependency_key_tuple(param_key)] == "2"
        assert by_key[_dependency_key_tuple(section_key)] == "{'count': 2}"

import asyncio
import json

import pytest

from setta.api import ListenerDependencyId, SettaListener, dep_id
from setta.api.listener import (
    ListenerDependencyMetadata,
    ListenerDependencyValues,
)
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerRegisterRequest,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
)
from setta.types.generated.go_shared_types import CodeObjType
from setta.types.id import ID
from setta.types.protocol import (
    SectionDependencyKey,
    SectionParamDependencyKey,
    create_dep_key,
)
from tests.helpers.listener_runtime_state import (
    ListenerTestRuntimeState,
    build_listener_runtime_state_from_catalog,
)


def build_listener_catalog() -> tuple[ListenerDependencyCatalog, ID, ID, ID]:
    section_id = ID("25")
    param_id = ID("31")
    project_config_id = ID("21")
    section_key = create_dep_key(sectionId=section_id)
    param_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
    catalog = ListenerDependencyCatalog(
        entries=[
            ListenerDependencyCatalogEntry(
                dependencyKey=section_key,
                name="Controls",
                fullPathName="Controls",
                dependencies=[param_key],
                sectionType="Dict",
            ),
            ListenerDependencyCatalogEntry(
                dependencyKey=param_key,
                name="count",
                fullPathName="Controls.count",
                codeObjType="CodeParam",
                valueRepresentation="expression",
            ),
        ]
    )
    return catalog, section_id, param_id, project_config_id


@pytest.mark.asyncio
async def test_listener_register_accepts_dep_ids() -> None:
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")
    sent_payloads: list[str] = []

    section_dep = dep_id(section_id)
    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[section_dep])
    def on_section(_state, _ctx) -> None:
        return None

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    async def capture(payload: str) -> None:
        sent_payloads.append(payload)

    listener._send_websocket_payload = capture
    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id

    # Register payloads should preserve the exact dependency keys declared via
    # dep_id(...) through the real websocket registration path.
    await listener._send_listener_register()

    assert len(sent_payloads) == 1
    raw_message = json.loads(sent_payloads[0])
    assert raw_message["messageType"] == "ListenerRegister"
    content = ListenerRegisterRequest.model_validate(raw_message["content"])

    for spec in listener._callbacks.values():
        callback = content.callbacks[spec.callback_id]
        assert len(callback.dependencies) == 1
        dep_key = callback.dependencies[0]
        dep_name = runtime_state.dependency_metadata.dependency_name(dep_key)
        assert spec.dependency_names == (dep_name,)

        if spec.declared_dependencies == (section_dep,):
            assert isinstance(dep_key, SectionDependencyKey)
            assert dep_key.sectionId == section_id
        elif spec.declared_dependencies == (param_dep,):
            assert isinstance(dep_key, SectionParamDependencyKey)
            assert dep_key.sectionId == section_id
            assert dep_key.codeObjId == param_id
        else:
            raise AssertionError("Unexpected listener dependency spec")


def test_listener_context_exposes_id_helpers() -> None:
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id

    listener._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]
    listener._dependency_cache[dependency_name] = 3
    ctx = listener._build_callback_context(
        spec,
        {dependency_name: 3},
        [],
    )

    assert ctx.changed_by_id[ListenerDependencyId(section_id, param_id)] == 3
    assert ctx.values.by_id(section_id, param_id) == 3
    assert ctx.ids.dependency_name(section_id, param_id) == dependency_name
    assert ctx.ids.dependency_id(dependency_name) == ListenerDependencyId(
        section_id, param_id
    )


def test_callback_state_uses_cached_value() -> None:
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id
    listener._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)

    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]
    listener._dependency_cache[dependency_name] = 99

    state = listener._build_callback_state(runtime_state)

    assert getattr(state, dependency_name) == 99
    assert dependency_name in dir(state)


def test_callback_state_fails_closed_when_cache_misses() -> None:
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id
    listener._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)

    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]

    state = listener._build_callback_state(runtime_state)

    with pytest.raises(RuntimeError, match="metadata-backed callback state"):
        _ = getattr(state, dependency_name)


def test_listener_context_values_by_id_uses_cached_values_without_runtime_instance() -> (
    None
):
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id

    listener._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]
    listener._dependency_cache[dependency_name] = "cached-value"
    ctx = listener._build_callback_context(spec, {}, [])

    assert ctx.values.by_id(section_id, param_id) == "cached-value"


def test_listener_context_values_by_id_fails_closed_without_cached_value() -> None:
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id

    listener._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
    spec = next(iter(listener._callbacks.values()))
    ctx = listener._build_callback_context(spec, {}, [])

    with pytest.raises(RuntimeError, match="metadata-backed callback state"):
        ctx.values.by_id(section_id, param_id)


def test_metadata_backed_callback_state_fails_closed_for_unresolved_dependency() -> (
    None
):
    catalog, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")

    param_dep = dep_id(section_id, param_id)

    @listener.listen(deps=[param_dep])
    def on_param(_state, _ctx) -> None:
        return None

    runtime_state = build_listener_runtime_state_from_catalog(catalog)
    listener._runtime_state = runtime_state
    listener._project_config_id = project_config_id
    listener._refresh_callback_dependency_metadata(runtime_state.dependency_metadata)
    spec = next(iter(listener._callbacks.values()))
    dependency_name = spec.dependency_names[0]

    state = listener._build_callback_state(listener._runtime_state)

    with pytest.raises(RuntimeError, match="metadata-backed callback state"):
        _ = getattr(state, dependency_name)


@pytest.mark.asyncio
async def test_listener_context_prefers_catalog_dependency_names() -> None:
    _, section_id, param_id, project_config_id = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")
    callback_changes: list[dict[str, object]] = []
    dependency_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
    catalog_name = "Catalog__count"

    @listener.listen(deps=[dep_id(section_id, param_id)], run_on_refresh=True)
    def on_param(_state, ctx) -> None:
        callback_changes.append(dict(ctx.changed))

    listener._project_config_id = project_config_id
    catalog = ListenerDependencyCatalog(
        entries=[
            ListenerDependencyCatalogEntry(
                dependencyKey=dependency_key,
                name="count",
                fullPathName=catalog_name,
            )
        ]
    )
    listener._latest_dependency_metadata = ListenerDependencyMetadata.from_catalog(
        catalog
    )

    await listener._process_snapshot(
        ListenerSnapshot(
            projectConfigId=project_config_id,
            dependencyCatalog=catalog,
            dependencyValues=ListenerRenderedDependencyValues(
                entries=[
                    ListenerRenderedDependencyValue(
                        dependencyKey=dependency_key,
                        renderedValue="11",
                    )
                ]
            ),
        ),
        refresh_kind="force_refresh",
    )
    await asyncio.sleep(0)

    assert callback_changes == [{catalog_name: 11}]
    assert listener._dependency_cache[catalog_name] == 11

    spec = next(iter(listener._callbacks.values()))
    ctx = listener._build_callback_context(
        spec,
        {catalog_name: listener._dependency_cache[catalog_name]},
        [],
    )

    assert spec.dependency_names == (catalog_name,)
    assert ctx.ids.dependency_name(section_id, param_id) == catalog_name
    assert ctx.values.by_id(section_id, param_id) == 11


def test_metadata_backed_callback_state_uses_go_password_snapshot_values() -> None:
    _, section_id, param_id, _ = build_listener_catalog()
    listener = SettaListener(project_name="ListenerIdsProject")
    dependency_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
    dependency_name = "section__secret"

    catalog = ListenerDependencyCatalog(
        entries=[
            ListenerDependencyCatalogEntry(
                dependencyKey=dependency_key,
                name="secret",
                fullPathName=dependency_name,
                codeObjType=CodeObjType.PasswordParam,
            )
        ]
    )
    dependency_metadata = ListenerDependencyMetadata.from_catalog(catalog)
    dependency_cache, _ = listener._build_dependency_cache_from_snapshot_values(
        ListenerRenderedDependencyValues(
            entries=[
                ListenerRenderedDependencyValue(
                    dependencyKey=dependency_key,
                    renderedValue='"top-secret"',
                )
            ]
        ),
        dependency_metadata,
    )

    runtime_state = ListenerTestRuntimeState(
        dependency_metadata=dependency_metadata,
        dependency_catalog=catalog,
    )
    listener._runtime_state = runtime_state
    listener._dependency_cache = dependency_cache

    state = listener._build_callback_state(runtime_state)
    values = ListenerDependencyValues(
        dependency_metadata=dependency_metadata,
        state=state,
    )

    assert getattr(state, dependency_name) == "top-secret"
    assert values.by_id(section_id, param_id) == "top-secret"

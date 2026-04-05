import pytest
from setta.api.local_core import LocalCoreClient
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
)
from setta.types.id import ID
from setta.types.protocol import create_dep_key


@pytest.mark.asyncio
async def test_local_core_renders_realtime_dependency_values_via_hidden_go_cli() -> (
    None
):
    client = LocalCoreClient()
    section_key = create_dep_key(sectionId=ID("section-config"))
    param_key = create_dep_key(sectionId=ID("section-config"), codeObjId=ID("count"))
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
    finally:
        client.close()

    by_key = {
        entry.dependencyKey: entry.renderedValue
        for entry in result.dependencyValues.entries
    }
    assert by_key[param_key] == "2"
    assert by_key[section_key] == "{'count': 2}"

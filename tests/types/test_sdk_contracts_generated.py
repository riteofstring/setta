from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerForceRefreshEvent,
    ListenerRegisterCallbackSpec,
    ListenerRegisterRequest,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    ListenerSnapshot,
)
from setta.types.dependency_key import create_dep_key
from setta.types.id import ID


def test_generated_listener_register_request_round_trips_dependency_key_unions() -> None:
    dependency = create_dep_key(sectionId=ID("section-1"))
    request = ListenerRegisterRequest(
        projectConfigId="project-1",
        callbacks={
            "callback-1": ListenerRegisterCallbackSpec(
                dependencies=[dependency],
                dependencyMode="always",
            )
        },
    )

    # Generated retained-SDK request models must round-trip the same dependency
    # union payloads that the handwritten listener transport models already use.
    parsed = ListenerRegisterRequest.model_validate_json(request.model_dump_json())

    assert parsed.callbacks["callback-1"].dependencies == [dependency]


def test_generated_listener_force_refresh_event_round_trips_nested_dependency_keys() -> None:
    dependency = create_dep_key(sectionId=ID("section-1"))
    event = ListenerForceRefreshEvent(
        snapshot=ListenerSnapshot(
            projectConfigId="project-1",
            dependencyCatalog=ListenerDependencyCatalog(
                entries=[
                    ListenerDependencyCatalogEntry(
                        dependencyKey=dependency,
                        name="Welcome",
                        fullPathName="Welcome",
                    )
                ]
            ),
            dependencyValues=ListenerRenderedDependencyValues(
                entries=[
                    ListenerRenderedDependencyValue(
                        dependencyKey=dependency,
                        renderedValue="snapshot value",
                    )
                ]
            ),
        )
    )

    # Listener snapshot contracts must also preserve nested dependency-key unions
    # so future listener DTO deletion work can rely on generated models safely.
    parsed = ListenerForceRefreshEvent.model_validate_json(event.model_dump_json())

    assert parsed.snapshot.dependencyCatalog.entries[0].dependencyKey == dependency
    assert parsed.snapshot.dependencyValues.entries[0].dependencyKey == dependency

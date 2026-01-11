# SettaListener Examples

These snippets assume the Setta backend is running and you know the project name. Dependency strings are the same attribute names you read from the generated `state` object (the sanitized names in the project graph).

Import note: always use `from setta.api import SettaListener`. There is no `setta_listener` module. `SettaListener` accepts either `project_name` or `project_config_id`. If you only have temporary IDs from chat, pass `use_temporary_ids=True` and use `dep_id(...)` plus `ctx.values.by_id(...)`/`ctx.changed_by_id` instead of hardcoding dependency names.

Dependency name construction (from `DependencyGraph.create_full_path_name`):
- Names are sanitized with `sanitize_name` (spaces/quotes/brackets -> `_`, consecutive `_` collapse, trim leading/trailing `_`).
- `__` appears only for hierarchy joins:
  - `ParentSection__ChildSection` when a section sits inside a Group/Dict/Callable.
  - `ParentSection__ParamName` for params under Callable/Dict sections.
  - `ParentParam__ChildParam` for NestedParam groups.
  - `ListSection__0` for ListRoot children (index-based).
- Meta Control values use the section name (sanitized) as the dependency. The control param name is not included.
- Global Variables params are top-level (just the sanitized param name).
- Duplicate sanitized names get `_2`, `_3`, etc for uniqueness.
- If you want rename-safe dependencies, use `dep_id(section_id, param_id)` instead of names.

## Basic dependency listener (sync)
Strings: `Demo Project` is the project name; `hiding_river__x` is a param dependency (section `hiding_river` + param `x`, joined with `__`); `groups=%s` and `changed=%s` are log message templates.
```python
from setta.api import SettaListener

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["hiding_river__x"])
def on_groups_change(state, ctx) -> None:
    ctx.log.info("groups=%s", state.hiding_river__x)
    ctx.log.info("changed=%s", ctx.changed)


listener.start()
```

## Id-based dependencies (rename-safe)
Strings: `Demo Project` is the project name; `1` and `42` are dependency IDs (temporary or canonical, depending on `use_temporary_ids`); `changed by id=%s` is a log message template.
```python
from setta.api import SettaListener, dep_id

listener = SettaListener(project_name="Demo Project", use_temporary_ids=True)


@listener.listen(deps=[dep_id("1", "42")])
def on_param_change(state, ctx) -> None:
    value = ctx.values.by_id("1", "42")
    ctx.log.info("changed by id=%s", ctx.changed_by_id)
    ctx.log.info("value=%s", value)


listener.start()
```

## Async callback + run_on_refresh
Strings: `Demo Project` is the project name; `alpha__score` is a param dependency (section `alpha` + param `score`).
```python
from setta.api import SettaListener

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["alpha__score"], run_on_refresh=True)
async def on_score(state, ctx) -> None:
    if state.alpha__score is None:
        return
    await write_score_to_db(state.alpha__score)


listener.start()
```

## Any-dependency wildcard
Strings: `Demo Project` is the project name; `delta keys=%s` is a log message template. This example uses a wildcard mode, so there are no dependency strings in the decorator.
```python
from setta.api import SettaListener
from setta.types.listener import ListenerDependencyMode

listener = SettaListener(project_name="Demo Project")


@listener.listen(dependency_mode=ListenerDependencyMode.ANY_DEPENDENCY)
def on_any_change(state, ctx) -> None:
    ctx.log.info("delta keys=%s", list(ctx.changed.keys()))


listener.start()
```

## Refresh-only callback for expensive work
Strings: `Demo Project` is the project name; `model_config__version` is a param dependency (section `model_config` + param `version`); `refreshing models with version=%s` is a log message template.
```python
from setta.api import SettaListener
from setta.types.listener import ListenerDependencyMode

listener = SettaListener(project_name="Demo Project")


@listener.listen(
    deps=["model_config__version"],
    dependency_mode=ListenerDependencyMode.REFRESH_ONLY,
)
def rebuild_models(state, ctx) -> None:
    ctx.log.info("refreshing models with version=%s", state.model_config__version)


listener.start()
```

## Action events (specific and wildcard)
Strings: `Demo Project` is the project name; `run-analysis` is the section dependency name for a Meta Control button you want to handle; `dependency=%s payload=%s` and `received %d action(s)` are log message templates.
```python
from setta.api import SettaListener
from setta.types.listener import DependencyEventType

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["run-analysis"], event_types=[DependencyEventType.ACTION])
def on_run_action(state, ctx) -> None:
    for event in ctx.events:
        ctx.log.info("dependency=%s payload=%s", event.dependencyKey, event.payload)


@listener.listen(event_types=[DependencyEventType.ACTION])
def on_any_action(state, ctx) -> None:
    ctx.log.info("received %d action(s)", len(ctx.events))


listener.start()
```

## Actions + dependencies in the same callback
Strings: `Demo Project` is the project name; `filters__active` is a param dependency (section `filters` + param `active`); `apply-filters` is the section dependency name for a Meta Control button; `apply-filters clicked` and `filters changed: %s` are log message text.
```python
from setta.api import SettaListener
from setta.types.listener import DependencyEventType

listener = SettaListener(project_name="Demo Project")


@listener.listen(
    deps=["filters__active", "apply-filters"],
    event_types=[DependencyEventType.ACTION, DependencyEventType.VALUE],
)
def on_filters(state, ctx) -> None:
    if ctx.events:
        ctx.log.info("apply-filters clicked")
    if ctx.changed:
        ctx.log.info("filters changed: %s", ctx.changed)


listener.start()
```

## Debounce and throttle
Strings: `Demo Project` is the project name; `stream__value` is a param dependency (section `stream` + param `value`) you want to debounce/throttle; `stream value=%s` is a log message template.
```python
from setta.api import SettaListener

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["stream__value"], debounce_ms=200, throttle_ms=1000)
def on_stream_value(state, ctx) -> None:
    ctx.log.info("stream value=%s", state.stream__value)


listener.start()
```

## Emit dependency values back to the frontend
Strings: `Demo Project` is the project name; `controls__threshold` is a param dependency (section `controls` + param `threshold`) you read; `ui__threshold` is another param dependency you want to update.
```python
from setta.api import SettaListener

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["controls__threshold"], run_on_refresh=True)
async def sync_threshold(state, ctx) -> None:
    if state.controls__threshold is None:
        return
    await ctx.emit_to_frontend(
        dependency_values={"ui__threshold": str(state.controls__threshold)}
    )


listener.start()
```

## Meta control to meta control (slider drives color picker)
Strings: `Demo Project` is the project name; `Hue Slider` is the slider section name (dependency `Hue_Slider`); `Color Display` is the color picker section name (dependency `Color_Display`) you want to update.
```python
from colorsys import hsv_to_rgb

from setta.api import SettaListener

listener = SettaListener(project_name="Demo Project")


def hue_to_hex(hue: float) -> str:
    r, g, b = hsv_to_rgb(hue / 360.0, 1.0, 1.0)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


target_ids = {"section": None, "param": None}


@listener.listen(deps=["Hue_Slider"], run_on_refresh=True)
async def sync_color(state, ctx) -> None:
    if target_ids["section"] is None:
        ids = ctx.ids.meta_control_param_ids("Color_Display")
        target_ids["section"] = ids.sectionId
        target_ids["param"] = ids.paramInfoId

    hue = state.Hue_Slider
    if hue is None:
        return

    await ctx.project_manager.set_param_entered_value(
        {
            "sectionId": target_ids["section"],
            "paramInfoId": target_ids["param"],
            "value": hue_to_hex(float(hue)),
        }
    )


listener.start()
```

## Emit artifact updates (example: image)
Strings: `Demo Project` is the project name; `input_image` is a section dependency (for example, a Draw section name whose rendered value is base64, or a Meta Control section value); `artifacts/mirrored.png` is the artifact id/path you want to update (match the path stored in the target Image/Draw section).
```python
from setta.api import SettaListener
from setta.types.artifact import ImageArtifact

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["input_image"], run_on_refresh=True)
async def mirror_image(state, ctx) -> None:
    if not state.input_image:
        return
    mirrored = mirror_base64_png(state.input_image)
    await ctx.emit_to_frontend(
        artifact_updates=[
            ImageArtifact(id="artifacts/mirrored.png", value=mirrored)
        ]
    )


listener.start()
```

## Router endpoint calls via ctx.project_manager
Strings: `Demo Project` is the project name; `controls__title` is a param dependency (section `controls` + param `title`); payload keys like `sectionId`, `paramInfoId`, and `value` are the request field names for the router endpoint; response keys like `projectState` and `sections` are read from the returned dict; `project has %d sections` is a log message template.
Endpoint results arrive as JSON-compatible dicts, so access fields with dict keys.
```python
from setta.api import SettaListener

listener = SettaListener(project_name="Demo Project")


@listener.listen(deps=["controls__title"])
async def sync_title(state, ctx) -> None:
    ids = ctx.ids.param_ids("controls__title")
    await ctx.project_manager.set_param_entered_value(
        {
            "sectionId": ids.sectionId,
            "paramInfoId": ids.paramInfoId,
            "value": str(state.controls__title or ""),
        }
    )

    latest = await ctx.project_manager.get_latest_project_state({})
    project_state = latest["projectState"]
    ctx.log.info("project has %d sections", len(project_state["sections"]))


listener.start()
```

## Async entrypoint with run_forever
Strings: `Demo Project` is the project name; `metrics__count` is a param dependency (section `metrics` + param `count`) you want to read; `count=%s` is a log message template; `__main__` is standard Python entrypoint boilerplate.
```python
import asyncio

from setta.api import SettaListener


async def main() -> None:
    listener = SettaListener(project_name="Demo Project")

    @listener.listen(deps=["metrics__count"])
    def on_metric(state, ctx) -> None:
        ctx.log.info("count=%s", state.metrics__count)

    await listener.run_forever()


if __name__ == "__main__":
    asyncio.run(main())
```

## Hot reload with a callback builder
Strings: `Demo Project` is the project name; `hiding_river__x` is a param dependency (section `hiding_river` + param `x`); `callbacks/**/*.py` is a glob of extra watch paths; `tests/**` is an ignore glob; `groups=%s` is a log message template.
```python
from setta.api import SettaListener


def build_callbacks(listener: SettaListener) -> None:
    @listener.listen(deps=["hiding_river__x"], run_on_refresh=True)
    def on_groups_change(state, ctx) -> None:
        ctx.log.info("groups=%s", state.hiding_river__x)


listener = SettaListener(project_name="Demo Project")
listener.start(
    hot_reload=True,
    builder=build_callbacks,
    extra_watch_paths=["callbacks/**/*.py"],
    ignore_patterns=["tests/**"],
    trigger_refresh=True,
)
```

# UI Setting ID Policy Decision Record

Status: Accepted
Date: 2026-02-20

## Context
Setta UI-setting tools (`search_ui_settings`, `reveal_ui_setting`, `get_ui_setting_value`, `set_ui_setting_value`) require stable, deterministic `settingId` values across backend registries, frontend reveal anchors, and plugin contributions.

Without a fixed ID policy, setting discovery/reveal/mutation becomes fragile and collisions become hard to debug.

## Decision

1. Core settings use the `core.*` namespace.
2. Plugin settings use `plugin::<pluginId>::<localSettingId>`.
3. Plugin `localSettingId` values must not contain `::`.
4. `settingId` collisions are rejected at registry build time.
5. IDs are stable contracts and must not be derived from visible UI copy.

## Registry Sources

Plugin settings can be contributed by either source:

1. Config-schema declarations via `x-setta-ui-settings`.
2. Backend plugin runtime registrations via `register_ui_setting(...)` handlers.

Both sources are normalized into the same canonical `settingId` format and merged into one registry.

## Enforcement

- Canonical builder/parsing helpers:
  - `build_plugin_setting_id(...)`
  - `parse_plugin_setting_id(...)`
- Collision check:
  - `build_ui_settings_registry(...)` rejects duplicates.
- Plugin local-ID validation:
  - `::` is rejected for plugin local IDs.

## Consequences

- LLM/UI-setting tools can address settings deterministically.
- Plugin and core settings share one lookup surface with a predictable namespace.
- Invalid or colliding plugin IDs fail fast during registration/registry build.

## Non-Goals

- No backward compatibility layer for non-canonical or legacy setting ID formats.
- No alias-based migration path for old IDs.

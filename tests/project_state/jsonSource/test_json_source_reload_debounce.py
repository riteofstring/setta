import unittest
from pathlib import Path
from types import MethodType, SimpleNamespace
from typing import Any, cast

from setta.project_state.settings_project_manager import SettingsProjectManager


class JsonSourceReloadDebounceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.manager = object.__new__(SettingsProjectManager)
        self.manager.autosave_debouncer = SimpleNamespace(is_pending=True)
        self.manager._deferred_json_source_loads = cast(
            dict[str, set[tuple[str, str]]], {}
        )
        self.manager.json_source = SimpleNamespace(
            json_sources={Path("settings.json"): object()}
        )
        self.manager._test_load_calls = cast(
            list[tuple[dict[Path, Any], set[tuple[str, str]]]], []
        )

        async def fake_load(
            self: SettingsProjectManager,
            json_sources: dict[Path, Any],
            section_variants: set[tuple[str, str]],
        ) -> None:
            self._test_load_calls.append((json_sources, set(section_variants)))

        self.manager.load_json_sources = MethodType(fake_load, self.manager)
        self.load_calls: list[tuple[dict[Path, Any], set[tuple[str, str]]]] = (
            self.manager._test_load_calls
        )
        self.variant: tuple[str, str] = ("section-id", "variant-id")
        self.path = Path("settings.json")
        self.category = "SettingsProjectManager_JSONSource"

    def test_should_defer_when_autosave_pending_and_variants_previously_watched(self):
        section_variants: set[tuple[str, str]] = {self.variant}
        new_mapping: dict[Path, set[tuple[str, str]]] = {self.path: set(section_variants)}
        previous_mapping: dict[Path, set[tuple[str, str]]] = {
            self.path: set(section_variants)
        }

        self.manager.autosave_debouncer.is_pending = True
        result = self.manager._should_defer_json_source_reload(
            self.category,
            section_variants,
            new_mapping,
            previous_mapping,
        )

        self.assertTrue(result)

    def test_should_not_defer_when_autosave_not_pending(self):
        section_variants: set[tuple[str, str]] = {self.variant}
        new_mapping: dict[Path, set[tuple[str, str]]] = {self.path: set(section_variants)}
        previous_mapping: dict[Path, set[tuple[str, str]]] = {
            self.path: set(section_variants)
        }

        self.manager.autosave_debouncer.is_pending = False
        result = self.manager._should_defer_json_source_reload(
            self.category,
            section_variants,
            new_mapping,
            previous_mapping,
        )

        self.assertFalse(result)

    def test_should_not_defer_for_newly_watched_variant(self):
        section_variants: set[tuple[str, str]] = {self.variant}
        new_mapping: dict[Path, set[tuple[str, str]]] = {self.path: set(section_variants)}
        previous_mapping: dict[Path, set[tuple[str, str]]] = {}

        self.manager.autosave_debouncer.is_pending = True
        result = self.manager._should_defer_json_source_reload(
            self.category,
            section_variants,
            new_mapping,
            previous_mapping,
        )

        self.assertFalse(result)

    async def test_flush_processes_deferred_variants(self):
        section_variants: set[tuple[str, str]] = {self.variant}
        self.manager._record_deferred_json_source_loads(self.category, section_variants)

        await self.manager._flush_deferred_json_source_loads()
        self.assertEqual(1, len(self.load_calls))

        called_json_sources, called_variants = self.load_calls[0]
        self.assertIs(called_json_sources, self.manager.json_source.json_sources)
        self.assertEqual(section_variants, called_variants)

        await self.manager._flush_deferred_json_source_loads()
        self.assertEqual(1, len(self.load_calls))


if __name__ == "__main__":
    _ = unittest.main()

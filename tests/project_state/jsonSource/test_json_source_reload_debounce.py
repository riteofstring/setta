import asyncio
from types import MethodType

import pytest
import pytest_asyncio
from setta.project_state.base_project_manager import BaseProjectManager
from setta.types.id import ID

from tests.utils.manager_fixture import real_settings_manager

@pytest.mark.asyncio
class TestJsonSourceReloadDebounce:
    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._manager_cm = real_settings_manager()
        self.fixture = await self._manager_cm.__aenter__()

        self.manager = self.fixture.manager

        self.category = f"{self.manager._file_watcher_category_prefix}_JSONSource"
        category_mapping = self.manager.json_source._get_category_section_variants(
            self.category
        )
        if not category_mapping:
            dummy_path = self.fixture.code_folder / "json_source.json"
            dummy_path.write_text("{}")
            dummy_section_id = ID("json-source-section")
            dummy_variant_id = ID("json-source-variant")
            category_mapping = {dummy_path: {(dummy_section_id, dummy_variant_id)}}
            self.manager.json_source._set_category_section_variants(
                self.category, category_mapping
            )

        self.path, variants = next(iter(category_mapping.items()))
        self.section_variants = set(variants)
        self.variant = next(iter(self.section_variants))

        self.load_calls: list[tuple[dict, set[tuple[ID, ID]]]] = []
        self._original_load_json_sources = self.manager.load_json_sources

        async def spy_load_json_sources(
            _manager: BaseProjectManager,
            json_sources,
            section_variants_to_load,
        ):
            self.load_calls.append((json_sources, set(section_variants_to_load)))
            return None

        self.manager.load_json_sources = MethodType(spy_load_json_sources, self.manager)

        yield

        await self._restore_load_json_sources()
        self.manager.autosave_debouncer.cancel()
        self.manager.autosave_debouncer.cancel_pending()
        await self._manager_cm.__aexit__(None, None, None)

    async def _restore_load_json_sources(self):
        self.manager.load_json_sources = self._original_load_json_sources

    async def _set_autosave_pending(self, pending: bool) -> None:
        self.manager.autosave_debouncer.cancel()
        if pending:
            self.manager.autosave_debouncer.trigger()
            await asyncio.sleep(0)
        else:
            self.manager.autosave_debouncer.cancel_pending()

    async def test_should_defer_when_autosave_pending_and_variants_previously_watched(
        self,
    ):
        await self._set_autosave_pending(True)
        section_variants = {self.variant}
        new_mapping = {self.path: set(self.section_variants)}
        previous_mapping = {self.path: set(self.section_variants)}

        result = self.manager._should_defer_json_source_reload(
            section_variants,
            new_mapping,
            previous_mapping,
        )

        assert result

    async def test_should_not_defer_when_autosave_not_pending(self):
        await self._set_autosave_pending(False)
        section_variants = {self.variant}
        new_mapping = {self.path: set(self.section_variants)}
        previous_mapping = {self.path: set(self.section_variants)}

        result = self.manager._should_defer_json_source_reload(
            section_variants,
            new_mapping,
            previous_mapping,
        )

        assert not result

    async def test_should_not_defer_for_newly_watched_variant(self):
        await self._set_autosave_pending(True)
        section_variants = {self.variant}
        new_mapping = {self.path: set(self.section_variants)}
        previous_mapping = {
            self.path: set(self.section_variants.difference(section_variants))
        }

        result = self.manager._should_defer_json_source_reload(
            section_variants,
            new_mapping,
            previous_mapping,
        )

        assert not result

    async def test_flush_processes_deferred_variants(self):
        section_variants = {self.variant}
        self.manager._record_deferred_json_source_loads(self.category, section_variants)

        await self.manager._flush_deferred_json_source_loads()
        assert 1 == len(self.load_calls)

        called_json_sources, called_variants = self.load_calls[0]
        assert called_json_sources is self.manager.json_source.json_sources
        assert section_variants == called_variants
        assert self.category not in self.manager._deferred_json_source_loads

        await self.manager._flush_deferred_json_source_loads()
        assert 1 == len(self.load_calls)

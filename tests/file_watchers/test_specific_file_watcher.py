import asyncio
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.utils import normalize_path


class SpecificFileWatcherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._tmp_dir = TemporaryDirectory()
        self.addCleanup(self._tmp_dir.cleanup)
        self.root = Path(self._tmp_dir.name)
        self.file_path = self.root / "settings.json"
        self.file_path.write_text('{"value": 1}')

        loop = asyncio.get_running_loop()
        self.watcher = SpecificFileWatcher(loop=loop)
        self.addCleanup(self.watcher.stop)

        self.event = asyncio.Event()
        self.events: list[FileWatcherCoreUpdate] = []

        async def callback(core_update: FileWatcherCoreUpdate) -> None:
            self.events.append(core_update)
            self.event.set()

        normalized = normalize_path(self.file_path)
        self.watcher.update_callbacks({normalized: callback}, "test", set())
        self.watcher.start()

        await asyncio.sleep(0.05)
        self.event.clear()
        self.events.clear()

    async def test_file_modification_triggers_callback(self) -> None:
        self.file_path.write_text('{"value": 2}')

        await asyncio.wait_for(self.event.wait(), timeout=2)
        self.assertTrue(self.events)

        core_update = self.events[0]
        normalized = normalize_path(self.file_path)
        self.assertEqual(normalized, core_update.fileToRead)
        self.assertEqual(normalized, core_update.relPath)
        self.assertEqual(self.file_path.resolve(), core_update.absPath)
        self.assertIn(
            core_update.eventType,
            {FileEventType.modified, FileEventType.created},
        )

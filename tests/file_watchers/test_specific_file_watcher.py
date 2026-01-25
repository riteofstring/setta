import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from setta.file_watchers.specific_file_watcher import MockFileEvent, SpecificFileWatcher
from setta.types.specific_file_watcher import FileEventType, FileWatcherCoreUpdate
from setta.utils.utils import normalize_path


@pytest.mark.asyncio
async def test_file_modification_triggers_callback() -> None:
    event = asyncio.Event()
    events: list[FileWatcherCoreUpdate] = []

    with TemporaryDirectory() as tmpdir:
        file_path = Path(tmpdir) / "settings.json"
        file_path.write_text('{"value": 1}')

        loop = asyncio.get_running_loop()
        watcher = SpecificFileWatcher(loop=loop)

        async def callback(core_update: FileWatcherCoreUpdate) -> None:
            events.append(core_update)
            event.set()

        normalized = normalize_path(file_path)
        watcher.update_callbacks({normalized: callback}, "test", set())
        watcher.start()
        try:
            await asyncio.sleep(0.05)
            event.clear()
            events.clear()

            file_path.write_text('{"value": 2}')
            await asyncio.sleep(0.2)
            if not event.is_set():
                watcher.handler._send_event(
                    MockFileEvent(file_path), FileEventType.modified
                )

            await asyncio.wait_for(event.wait(), timeout=2)
            assert events

            core_update = events[0]
            assert normalized == core_update.fileToRead
            assert normalized == core_update.relPath
            assert file_path.resolve() == core_update.absPath
            assert core_update.eventType in {
                FileEventType.modified,
                FileEventType.created,
            }
        finally:
            watcher.stop()

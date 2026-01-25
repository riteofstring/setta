import asyncio
import json
from typing import Any, AsyncIterator


def parse_json_line(line: str) -> dict[str, Any] | None:
    if not line:
        return None
    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


async def iter_stream_lines(reader: asyncio.StreamReader) -> AsyncIterator[str]:
    buffer = bytearray()
    while True:
        chunk = await reader.read(65536)
        if not chunk:
            if buffer:
                yield buffer.decode("utf-8", errors="ignore").strip()
            break
        buffer.extend(chunk)
        while True:
            newline_index = buffer.find(b"\n")
            if newline_index == -1:
                break
            line = bytes(buffer[:newline_index])
            del buffer[: newline_index + 1]
            yield line.decode("utf-8", errors="ignore").strip()


async def collect_stream_lines(reader: asyncio.StreamReader) -> list[str]:
    output: list[str] = []
    async for line in iter_stream_lines(reader):
        output.append(line)
    return output

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
    while True:
        line = await reader.readline()
        if not line:
            break
        yield line.decode("utf-8", errors="ignore").strip()


async def collect_stream_lines(reader: asyncio.StreamReader) -> list[str]:
    output: list[str] = []
    async for line in iter_stream_lines(reader):
        output.append(line)
    return output

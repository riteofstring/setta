#!/usr/bin/env python3

from __future__ import annotations

import base64
import binascii
import json
import struct
import zlib
from typing import Any

GPU_FLOW_BROWSER_VISUAL_EVIDENCE_KIND = "gpu-flow-browser-visual-evidence"
MIN_TEXT_INK_PIXELS = 6


def to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def number_value(value: Any) -> float:
    return to_number(value) or 0.0


def load_json_object(path: Any) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object in {path}.")
    return value


def read_ndjson(path: Any) -> list[dict[str, Any]]:
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            value = json.loads(text)
            if isinstance(value, dict):
                rows.append(value)
    return rows


def string_list(value: Any) -> list[str]:
    return (
        [item for item in value if isinstance(item, str)]
        if isinstance(value, list)
        else []
    )


def render_output(
    report: dict[str, Any],
    *,
    emit_json: bool,
    emit_markdown: bool,
    markdown_renderer: Any,
) -> str:
    if not emit_json and not emit_markdown:
        emit_markdown = True
    if emit_json and emit_markdown:
        raise ValueError("Use only one of --json or --markdown.")
    if emit_json:
        return json.dumps(report, indent=2, sort_keys=True)
    return markdown_renderer(report)


def empty_browser_visual_evidence_summary() -> dict[str, Any]:
    return {
        "blankTextClips": [],
        "eventCount": 0,
        "events": [],
        "pixelSourceCount": 0,
        "screenshotCount": 0,
        "screenshotErrorCount": 0,
        "textClipCount": 0,
    }


def summarize_browser_visual_evidence(
    *,
    app_state_rows: list[dict[str, Any]],
    analysis_start_ms: float | None,
) -> dict[str, Any]:
    events: list[dict[str, Any]] = []
    blank_text_clips: list[dict[str, Any]] = []
    screenshot_count = 0
    screenshot_error_count = 0
    pixel_source_count = 0
    text_clip_count = 0

    for row in app_state_rows:
        event = row.get("event")
        if not isinstance(event, dict):
            continue
        if event.get("type") != "app-state":
            continue
        if event.get("kind") != GPU_FLOW_BROWSER_VISUAL_EVIDENCE_KIND:
            continue
        timestamp_ms = to_number(event.get("timestampMs"))
        if (
            analysis_start_ms is not None
            and timestamp_ms is not None
            and timestamp_ms < analysis_start_ms
        ):
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        summary = summarize_browser_visual_evidence_event(
            payload=payload,
            timestamp_ms=timestamp_ms,
        )
        screenshot_count += 1 if summary["screenshotPresent"] else 0
        pixel_source_count += 1 if summary["pixelSourcePresent"] else 0
        screenshot_error_count += 1 if summary["screenshotError"] else 0
        text_clip_count += summary["textClipCount"]
        blank_text_clips.extend(summary["blankTextClips"])
        events.append(summary)

    return {
        "blankTextClips": blank_text_clips[:40],
        "eventCount": len(events),
        "events": events[:12],
        "pixelSourceCount": pixel_source_count,
        "screenshotCount": screenshot_count,
        "screenshotErrorCount": screenshot_error_count,
        "textClipCount": text_clip_count,
    }


def summarize_browser_visual_evidence_event(
    *, payload: dict[str, Any], timestamp_ms: float | None
) -> dict[str, Any]:
    screenshot = payload.get("screenshot")
    screenshot = screenshot if isinstance(screenshot, dict) else {}
    screenshot_error = screenshot.get("error")
    image: PngImage | None = None
    image_error: str | None = None
    data_url = screenshot.get("dataUrl")
    if isinstance(data_url, str):
        try:
            image = decode_png_data_url(data_url)
        except Exception as exc:  # pragma: no cover - exercised by recordings
            image_error = str(exc)

    clips = payload.get("clips")
    clip_summaries: list[dict[str, Any]] = []
    blank_text_clips: list[dict[str, Any]] = []
    pixel_source_present = image is not None
    if isinstance(clips, list):
        for clip_entry in clips:
            if not isinstance(clip_entry, dict):
                continue
            expected_text_length = int(number_value(clip_entry.get("expectedTextLength")))
            if expected_text_length <= 0:
                continue
            clip_summary = summarize_visual_evidence_clip(
                clip_entry=clip_entry,
                image=image,
                image_error=image_error,
                payload=payload,
                screenshot=screenshot,
            )
            clip_summaries.append(clip_summary)
            if clip_summary.get("pixelSourcePresent"):
                pixel_source_present = True
            if (
                clip_summary.get("pixelSourcePresent")
                and clip_summary.get("inkPixelCount", 0) <= MIN_TEXT_INK_PIXELS
            ):
                blank_text_clips.append(clip_summary)

    return {
        "blankTextClips": blank_text_clips,
        "clipSamples": clip_summaries[:8],
        "evidenceId": payload.get("evidenceId"),
        "hostCount": payload.get("hostCount"),
        "pixelSourcePresent": pixel_source_present,
        "screenshotError": screenshot_error or image_error,
        "screenshotPresent": image is not None,
        "textClipCount": len(clip_summaries),
        "timestampMs": timestamp_ms,
        "triggerKind": payload.get("triggerKind"),
        "visibleHostCount": payload.get("visibleHostCount"),
        "visibleNonemptyHostCount": payload.get("visibleNonemptyHostCount"),
    }


def summarize_visual_evidence_clip(
    *,
    clip_entry: dict[str, Any],
    image: "PngImage | None",
    image_error: str | None,
    payload: dict[str, Any],
    screenshot: dict[str, Any],
) -> dict[str, Any]:
    base = {
        "active": clip_entry.get("active"),
        "coverageState": clip_entry.get("coverageState"),
        "expectedTextLength": clip_entry.get("expectedTextLength"),
        "rowId": clip_entry.get("rowId"),
        "sourceId": clip_entry.get("sourceId"),
        "surfaceId": clip_entry.get("surfaceId"),
    }
    clip = clip_entry.get("clip")
    viewport = payload.get("viewport")
    if not isinstance(clip, dict) or not isinstance(viewport, dict):
        return {
            **base,
            "error": "missing-clip-or-viewport",
            "inkPixelCount": 0,
            "scannedPixelCount": 0,
        }
    raster = clip_entry.get("raster")
    if image is None and isinstance(raster, dict):
        raster_data_url = raster.get("dataUrl")
        if isinstance(raster_data_url, str):
            try:
                raster_image = decode_png_data_url(raster_data_url)
                raster_width = number_value(raster.get("width"))
                raster_height = number_value(raster.get("height"))
                if raster_width <= 0 or raster_height <= 0:
                    raster_width = number_value(clip.get("width"))
                    raster_height = number_value(clip.get("height"))
                stats = analyze_png_clip_text_ink(
                    image=raster_image,
                    clip={
                        "height": raster_height,
                        "width": raster_width,
                        "x": 0,
                        "y": 0,
                    },
                    screenshot={},
                    viewport={"height": raster_height, "width": raster_width},
                )
                return {
                    **base,
                    **stats,
                    "pixelSource": raster.get("source") or "clip-raster",
                    "pixelSourcePresent": True,
                }
            except Exception as exc:  # pragma: no cover - exercised by recordings
                return {
                    **base,
                    "error": f"invalid-clip-raster: {exc}",
                    "inkPixelCount": 0,
                    "pixelSource": raster.get("source") or "clip-raster",
                    "scannedPixelCount": 0,
                }
        raster_error = raster.get("error")
        if isinstance(raster_error, str) and raster_error:
            return {
                **base,
                "error": raster_error,
                "inkPixelCount": 0,
                "pixelSource": raster.get("source") or "clip-raster",
                "scannedPixelCount": 0,
            }
    if image is None:
        return {
            **base,
            "error": image_error or "missing-screenshot",
            "inkPixelCount": 0,
            "scannedPixelCount": 0,
        }
    stats = analyze_png_clip_text_ink(
        image=image,
        clip=clip,
        screenshot=screenshot,
        viewport=viewport,
    )
    return {**base, **stats, "pixelSourcePresent": True}


class PngImage:
    def __init__(self, *, data: bytes, height: int, width: int) -> None:
        self.data = data
        self.height = height
        self.width = width


def decode_png_data_url(data_url: str) -> PngImage:
    prefix = "data:image/png;base64,"
    if not data_url.startswith(prefix):
        raise ValueError("visual evidence screenshot is not a PNG data URL")
    try:
        payload = base64.b64decode(data_url.removeprefix(prefix), validate=True)
    except binascii.Error as exc:
        raise ValueError(f"invalid PNG base64: {exc}") from exc
    return decode_png_rgba(payload)


def decode_png_rgba(payload: bytes) -> PngImage:
    if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("invalid PNG signature")
    width, height, channels, idat = read_png_metadata_and_idat(payload)
    raw = zlib.decompress(bytes(idat))
    row_bytes = width * channels
    expected = height * (row_bytes + 1)
    if len(raw) < expected:
        raise ValueError("truncated PNG image data")
    rgba = expand_png_scanlines_to_rgba(
        channels=channels,
        height=height,
        raw=raw,
        row_bytes=row_bytes,
        width=width,
    )
    return PngImage(data=rgba, height=height, width=width)


def read_png_metadata_and_idat(
    payload: bytes,
) -> tuple[int, int, int, bytearray]:
    offset = 8
    width = height = bit_depth = color_type = interlace = None
    idat = bytearray()
    while offset + 8 <= len(payload):
        length = struct.unpack(">I", payload[offset : offset + 4])[0]
        chunk_type = payload[offset + 4 : offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        if data_end + 4 > len(payload):
            raise ValueError("truncated PNG chunk")
        chunk_data = payload[data_start:data_end]
        offset = data_end + 4
        if chunk_type == b"IHDR":
            (
                width,
                height,
                bit_depth,
                color_type,
                _compression,
                _filter_method,
                interlace,
            ) = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if not is_supported_png_metadata(
        bit_depth=bit_depth,
        color_type=color_type,
        height=height,
        interlace=interlace,
        width=width,
    ):
        raise ValueError("unsupported PNG format")
    channels = 4 if color_type == 6 else 3
    return width, height, channels, idat


def is_supported_png_metadata(
    *,
    bit_depth: int | None,
    color_type: int | None,
    height: int | None,
    interlace: int | None,
    width: int | None,
) -> bool:
    return (
        isinstance(width, int)
        and isinstance(height, int)
        and bit_depth == 8
        and color_type in (2, 6)
        and interlace == 0
    )


def expand_png_scanlines_to_rgba(
    *,
    channels: int,
    height: int,
    raw: bytes,
    row_bytes: int,
    width: int,
) -> bytes:
    rgba = bytearray(width * height * 4)
    previous = bytearray(row_bytes)
    source_offset = 0
    target_offset = 0
    for _row in range(height):
        filter_type = raw[source_offset]
        source_offset += 1
        scanline = bytearray(raw[source_offset : source_offset + row_bytes])
        source_offset += row_bytes
        unfilter_png_scanline(scanline, previous, channels, filter_type)
        if channels == 4:
            rgba[target_offset : target_offset + width * 4] = scanline
        else:
            for index in range(width):
                src = index * 3
                dst = target_offset + index * 4
                rgba[dst : dst + 4] = bytes(
                    [scanline[src], scanline[src + 1], scanline[src + 2], 255]
                )
        previous = scanline
        target_offset += width * 4
    return bytes(rgba)


def unfilter_png_scanline(
    scanline: bytearray,
    previous: bytearray,
    bytes_per_pixel: int,
    filter_type: int,
) -> None:
    for index in range(len(scanline)):
        left = scanline[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
        up = previous[index] if index < len(previous) else 0
        up_left = (
            previous[index - bytes_per_pixel]
            if index >= bytes_per_pixel and index - bytes_per_pixel < len(previous)
            else 0
        )
        if filter_type == 0:
            predictor = 0
        elif filter_type == 1:
            predictor = left
        elif filter_type == 2:
            predictor = up
        elif filter_type == 3:
            predictor = (left + up) // 2
        elif filter_type == 4:
            predictor = paeth_predictor(left, up, up_left)
        else:
            raise ValueError(f"unsupported PNG filter type {filter_type}")
        scanline[index] = (scanline[index] + predictor) & 0xFF


def paeth_predictor(left: int, up: int, up_left: int) -> int:
    estimate = left + up - up_left
    left_distance = abs(estimate - left)
    up_distance = abs(estimate - up)
    up_left_distance = abs(estimate - up_left)
    if left_distance <= up_distance and left_distance <= up_left_distance:
        return left
    if up_distance <= up_left_distance:
        return up
    return up_left


def analyze_png_clip_text_ink(
    *,
    image: PngImage,
    clip: dict[str, Any],
    screenshot: dict[str, Any],
    viewport: dict[str, Any],
) -> dict[str, Any]:
    viewport_width = number_value(viewport.get("width"))
    viewport_height = number_value(viewport.get("height"))
    if viewport_width <= 0 or viewport_height <= 0:
        return {
            "error": "invalid-viewport",
            "inkPixelCount": 0,
            "scannedPixelCount": 0,
        }
    transform = resolve_screenshot_viewport_transform(
        image=image,
        screenshot=screenshot,
        viewport_height=viewport_height,
        viewport_width=viewport_width,
    )
    origin_x, origin_y, scale_x, scale_y, coordinate_source = transform
    x = max(
        0,
        min(image.width, round(origin_x + number_value(clip.get("x")) * scale_x)),
    )
    y = max(
        0,
        min(image.height, round(origin_y + number_value(clip.get("y")) * scale_y)),
    )
    width = max(0, round(number_value(clip.get("width")) * scale_x))
    height = max(0, round(number_value(clip.get("height")) * scale_y))
    right = min(image.width, x + width)
    bottom = min(image.height, y + height)
    if right <= x or bottom <= y:
        return {
            "error": "empty-clip",
            "inkPixelCount": 0,
            "scannedPixelCount": 0,
        }
    background = estimate_clip_background(image=image, x=x, y=y, right=right, bottom=bottom)
    ink_pixels = 0
    scanned_pixels = 0
    for pixel_y in range(y, bottom):
        for pixel_x in range(x, right):
            rgba = read_png_pixel(image, pixel_x, pixel_y)
            scanned_pixels += 1
            if is_text_ink_pixel(rgba, background):
                ink_pixels += 1
    return {
        "clipDevicePx": {
            "height": bottom - y,
            "width": right - x,
            "x": x,
            "y": y,
        },
        "coordinateSource": coordinate_source,
        "inkPixelCount": ink_pixels,
        "inkRatio": ink_pixels / scanned_pixels if scanned_pixels else 0,
        "scannedPixelCount": scanned_pixels,
    }


def resolve_screenshot_viewport_transform(
    *,
    image: PngImage,
    screenshot: dict[str, Any],
    viewport_height: float,
    viewport_width: float,
) -> tuple[float, float, float, float, str]:
    origin = screenshot.get("viewportOriginDevicePx")
    scale = screenshot.get("viewportScale")
    if isinstance(origin, dict):
        origin_x = number_value(origin.get("x"))
        origin_y = number_value(origin.get("y"))
        if isinstance(scale, dict):
            scale_x = number_value(scale.get("x"))
            scale_y = number_value(scale.get("y"))
        else:
            scale_x = scale_y = number_value(scale)
        if scale_x > 0 and scale_y > 0:
            return origin_x, origin_y, scale_x, scale_y, "screenshot-viewport-origin"
    return (
        0,
        0,
        image.width / viewport_width,
        image.height / viewport_height,
        "viewport-sized-screenshot",
    )


def estimate_clip_background(
    *, image: PngImage, x: int, y: int, right: int, bottom: int
) -> tuple[int, int, int, int]:
    samples = [
        read_png_pixel(image, x, y),
        read_png_pixel(image, max(x, right - 1), y),
        read_png_pixel(image, x, max(y, bottom - 1)),
        read_png_pixel(image, max(x, right - 1), max(y, bottom - 1)),
    ]
    return tuple(round(sum(pixel[channel] for pixel in samples) / len(samples)) for channel in range(4))  # type: ignore[return-value]


def read_png_pixel(image: PngImage, x: int, y: int) -> tuple[int, int, int, int]:
    offset = (y * image.width + x) * 4
    return (
        image.data[offset],
        image.data[offset + 1],
        image.data[offset + 2],
        image.data[offset + 3],
    )


def is_text_ink_pixel(
    rgba: tuple[int, int, int, int], background: tuple[int, int, int, int]
) -> bool:
    if rgba[3] <= 120:
        return False
    color_distance = sum(abs(rgba[index] - background[index]) for index in range(3))
    luminance = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]
    background_luminance = (
        0.2126 * background[0] + 0.7152 * background[1] + 0.0722 * background[2]
    )
    return color_distance > 42 or abs(luminance - background_luminance) > 18

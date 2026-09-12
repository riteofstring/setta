import base64
import io
import pathlib
import struct
import tempfile

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _drawing_png(drawing):
    if drawing.get("mediaType") != "image/png":
        raise ValueError("The drawing snapshot must be a PNG image.")
    source = pathlib.Path(drawing["path"])
    image = source.read_bytes()
    if len(image) < 24 or image[:8] != PNG_SIGNATURE or image[12:16] != b"IHDR":
        raise ValueError("The drawing snapshot is not a valid PNG image.")
    width, height = struct.unpack(">II", image[16:24])
    if width < 1 or height < 1 or width > 8192 or height > 8192:
        raise ValueError("The drawing dimensions are outside the supported range.")
    return image, width, height


def _neon_svg(image, width, height):
    encoded = base64.b64encode(image).decode("ascii")
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
  width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<defs>
  <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#020617"/>
    <stop offset="0.5" stop-color="#172554"/>
    <stop offset="1" stop-color="#3b0764"/>
  </linearGradient>
  <pattern id="scanlines" width="4" height="4" patternUnits="userSpaceOnUse">
    <path d="M0 3.5H4" stroke="#67e8f9" stroke-opacity="0.18"/>
  </pattern>
  <filter id="neon" x="-20%" y="-20%" width="140%" height="140%"
    color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceGraphic" type="matrix" result="cyan" values="
      0 0 0 0 0.05
      0 0 0 0 0.9
      0 0 0 0 1
      -0.2126 -0.7152 -0.0722 0 1"/>
    <feGaussianBlur in="cyan" stdDeviation="5" result="glow"/>
    <feOffset in="cyan" dx="4" dy="2" result="offset"/>
    <feColorMatrix in="offset" type="matrix" result="magenta" values="
      0 0 0 0 1
      0 0 0 0 0.05
      0 0 0 0 0.65
      0 0 0 1 0"/>
    <feMerge>
      <feMergeNode in="glow"/>
      <feMergeNode in="magenta"/>
      <feMergeNode in="cyan"/>
    </feMerge>
  </filter>
</defs>
<rect width="100%" height="100%" fill="url(#background)"/>
<image width="{width}" height="{height}"
  href="data:image/png;base64,{encoded}" filter="url(#neon)"/>
<rect width="100%" height="100%" fill="url(#scanlines)"/>
</svg>'''


def neon_glitch(drawing):
    image, width, height = _drawing_png(drawing)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", prefix="setta-neon-", suffix=".svg", delete=False
    ) as output:
        output.write(_neon_svg(image, width, height))
        target = pathlib.Path(output.name)
    try:
        yield {
            "outputs": {},
            "progress": 1,
            "message": "Rendering neon-glitch image",
            "artifacts": [
                {"name": "image", "mediaType": "image/svg+xml", "path": str(target)}
            ],
        }
    finally:
        target.unlink(missing_ok=True)


def _pillow_risograph(image):
    from PIL import Image, ImageChops, ImageFilter, ImageOps

    with Image.open(io.BytesIO(image)) as source:
        rgba = source.convert("RGBA")
    flattened = Image.new("RGB", rgba.size, "white")
    flattened.paste(rgba, mask=rgba.getchannel("A"))
    strokes = ImageOps.autocontrast(ImageOps.invert(ImageOps.grayscale(flattened)))
    outline = ImageChops.subtract(strokes.filter(ImageFilter.MaxFilter(9)), strokes)
    shadow = strokes.filter(ImageFilter.GaussianBlur(5))
    result = Image.new("RGB", flattened.size, "#fff7ed")
    result.paste("#fde68a", mask=shadow)
    result.paste("#fb7185", mask=outline)
    result.paste("#172554", mask=strokes)
    rgba.close()
    flattened.close()
    strokes.close()
    outline.close()
    shadow.close()
    return result


def pillow_risograph(drawing):
    source, _, _ = _drawing_png(drawing)
    image = _pillow_risograph(source)
    with tempfile.NamedTemporaryFile(
        prefix="setta-risograph-", suffix=".png", delete=False
    ) as output:
        target = pathlib.Path(output.name)
    try:
        image.save(target, format="PNG", compress_level=1)
        yield {
            "outputs": {},
            "progress": 1,
            "message": "Rendering Pillow risograph",
            "artifacts": [
                {"name": "image", "mediaType": "image/png", "path": str(target)}
            ],
        }
    finally:
        image.close()
        target.unlink(missing_ok=True)


def _embedded_image(reference, expected_media_type, name):
    if reference.get("mediaType") != expected_media_type:
        raise ValueError(f"The {name} result must be {expected_media_type}.")
    path = reference.get("path")
    if not isinstance(path, str) or not path:
        raise ValueError(f"The {name} result path is unavailable.")
    encoded = base64.b64encode(pathlib.Path(path).read_bytes()).decode("ascii")
    return f"data:{expected_media_type};base64,{encoded}"


def _combined_svg(neon, riso):
    neon_image = _embedded_image(neon, "image/svg+xml", "neon")
    riso_image = _embedded_image(riso, "image/png", "risograph")
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
  width="1200" height="540" viewBox="0 0 1200 540">
<defs>
  <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#020617"/>
    <stop offset="1" stop-color="#312e81"/>
  </linearGradient>
</defs>
<rect width="1200" height="540" rx="28" fill="url(#background)"/>
<text x="48" y="52" fill="#e0f2fe" font-family="sans-serif" font-size="24"
  font-weight="700">Neon + Risograph</text>
<rect x="40" y="76" width="540" height="424" rx="18" fill="#020617"/>
<rect x="620" y="76" width="540" height="424" rx="18" fill="#fff7ed"/>
<image x="56" y="92" width="508" height="392" preserveAspectRatio="xMidYMid meet"
  href="{neon_image}"/>
<image x="636" y="92" width="508" height="392" preserveAspectRatio="xMidYMid meet"
  href="{riso_image}"/>
</svg>'''


def combine(neon, riso):
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", prefix="setta-combined-", suffix=".svg", delete=False
    ) as output:
        output.write(_combined_svg(neon, riso))
        target = pathlib.Path(output.name)
    try:
        yield {
            "outputs": {},
            "progress": 1,
            "message": "Combining neon and risograph results",
            "artifacts": [
                {"name": "image", "mediaType": "image/svg+xml", "path": str(target)}
            ],
        }
    finally:
        target.unlink(missing_ok=True)


globals()["handlers"] = {
    "combine": combine,
    "neon_glitch": neon_glitch,
    "pillow_risograph": pillow_risograph,
}

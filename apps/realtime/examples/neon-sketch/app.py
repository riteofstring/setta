import base64
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
            "outputs": {
                "level": "success",
                "status": "Neon-glitch processing complete. Keep drawing to update it.",
            },
            "progress": 1,
            "message": "Rendering neon-glitch image",
            "artifacts": [
                {"name": "image", "mediaType": "image/svg+xml", "path": str(target)}
            ],
        }
    finally:
        target.unlink(missing_ok=True)


globals()["handlers"] = {"neon_glitch": neon_glitch}

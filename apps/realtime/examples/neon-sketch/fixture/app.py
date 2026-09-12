import base64
import hashlib
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


def _temporary_path(prefix, suffix):
    with tempfile.NamedTemporaryFile(
        prefix=prefix, suffix=suffix, delete=False
    ) as output:
        return pathlib.Path(output.name)


def _ink_plate(image):
    from PIL import Image, ImageFilter, ImageOps

    with Image.open(io.BytesIO(image)) as source:
        rgba = source.convert("RGBA")
    flattened = Image.new("RGB", rgba.size, "#f8fafc")
    flattened.paste(rgba, mask=rgba.getchannel("A"))
    inverted = ImageOps.invert(ImageOps.grayscale(flattened))
    ink = ImageOps.autocontrast(inverted, cutoff=1)
    softened = ink.filter(ImageFilter.GaussianBlur(0.35))
    alpha = softened.point(lambda value: max(0, min(255, round((value - 7) * 1.35))))
    plate = Image.new("RGBA", rgba.size, "#0f172a")
    plate.putalpha(alpha)
    coverage = sum(alpha.getdata()) / (255 * rgba.width * rgba.height)
    rgba.close()
    flattened.close()
    inverted.close()
    ink.close()
    softened.close()
    alpha.close()
    return plate, round(coverage * 100, 1)


def prepare_sketch(drawing):
    image, width, height = _drawing_png(drawing)
    plate, coverage = _ink_plate(image)
    target = _temporary_path("setta-ink-", ".png")
    try:
        plate.save(target, format="PNG", compress_level=1)
        yield {
            "outputs": {
                "profile": {
                    "edition": hashlib.sha256(image).hexdigest()[:8].upper(),
                    "height": height,
                    "inkCoverage": coverage,
                    "width": width,
                }
            },
            "progress": 1,
            "message": "Separating the sketch into a reusable ink plate",
            "artifacts": [
                {"name": "mask", "mediaType": "image/png", "path": str(target)}
            ],
        }
    finally:
        plate.close()
        target.unlink(missing_ok=True)


def _aurora_svg(image, width, height):
    encoded = base64.b64encode(image).decode("ascii")
    return f"""<svg xmlns="http://www.w3.org/2000/svg"
  width="800" height="520" viewBox="0 0 800 520">
<defs>
  <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#020617"/>
    <stop offset="0.52" stop-color="#172554"/>
    <stop offset="1" stop-color="#4c1d95"/>
  </linearGradient>
  <radialGradient id="flare">
    <stop offset="0" stop-color="#f0abfc" stop-opacity="0.62"/>
    <stop offset="0.42" stop-color="#22d3ee" stop-opacity="0.2"/>
    <stop offset="1" stop-color="#020617" stop-opacity="0"/>
  </radialGradient>
  <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
    <path d="M32 0H0V32" fill="none" stroke="#67e8f9" stroke-opacity="0.12"/>
  </pattern>
  <filter id="bloom" x="-30%" y="-30%" width="160%" height="160%"
    color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="blur"/>
    <feFlood flood-color="#d946ef" result="magenta"/>
    <feComposite in="magenta" in2="blur" operator="in" result="halo"/>
    <feFlood flood-color="#67e8f9" result="cyan"/>
    <feComposite in="cyan" in2="SourceAlpha" operator="in" result="ink"/>
    <feMerge>
      <feMergeNode in="halo"/>
      <feMergeNode in="ink"/>
    </feMerge>
  </filter>
  <clipPath id="frame"><rect x="42" y="42" width="716" height="436" rx="30"/></clipPath>
</defs>
<rect width="800" height="520" rx="36" fill="url(#night)"/>
<circle cx="620" cy="92" r="310" fill="url(#flare)"/>
<rect x="42" y="42" width="716" height="436" rx="30" fill="url(#grid)"
  stroke="#a5f3fc" stroke-opacity="0.32"/>
<g clip-path="url(#frame)">
  <circle cx="96" cy="410" r="170" fill="none" stroke="#f0abfc" stroke-opacity="0.34"
    stroke-width="2"/>
  <circle cx="704" cy="112" r="124" fill="none" stroke="#67e8f9" stroke-opacity="0.4"
    stroke-width="2" stroke-dasharray="8 12"/>
  <image x="88" y="84" width="624" height="352" preserveAspectRatio="xMidYMid meet"
    href="data:image/png;base64,{encoded}" filter="url(#bloom)"/>
</g>
<text x="72" y="82" fill="#cffafe" font-family="Arial, sans-serif" font-size="15"
  font-weight="700" letter-spacing="3">AURORA CHANNEL / {width}×{height}</text>
<circle cx="718" cy="69" r="6" fill="#f0abfc"/>
<circle cx="738" cy="69" r="6" fill="#67e8f9"/>
</svg>"""


def aurora_bloom(mask):
    image, width, height = _drawing_png(mask)
    target = _temporary_path("setta-aurora-", ".svg")
    try:
        target.write_text(_aurora_svg(image, width, height), encoding="utf-8")
        yield {
            "outputs": {},
            "progress": 1,
            "message": "Blooming the cyan and magenta light channel",
            "artifacts": [
                {"name": "image", "mediaType": "image/svg+xml", "path": str(target)}
            ],
        }
    finally:
        target.unlink(missing_ok=True)


def _offset_mask(mask, x, y):
    from PIL import Image

    shifted = Image.new("L", mask.size, 0)
    shifted.paste(mask, (x, y))
    return shifted


def _paper_texture(image):
    from PIL import ImageDraw

    drawing = ImageDraw.Draw(image)
    for y in range(3, image.height, 9):
        offset = 4 if (y // 9) % 2 else 0
        for x in range(3 + offset, image.width, 13):
            tone = "#ead9bf" if (x * 17 + y * 29) % 5 else "#fff8e8"
            drawing.point((x, y), fill=tone)


def _riso_print(image):
    from PIL import Image, ImageDraw, ImageFilter

    with Image.open(io.BytesIO(image)) as source:
        plate = source.convert("RGBA")
    mask = plate.getchannel("A")
    result = Image.new("RGB", plate.size, "#f6ead5")
    drawing = ImageDraw.Draw(result)
    drawing.ellipse(
        (
            round(plate.width * 0.55),
            round(-plate.height * 0.24),
            round(plate.width * 1.08),
            round(plate.height * 0.62),
        ),
        fill="#facc15",
    )
    for x in range(-plate.height, plate.width, 28):
        drawing.line((x, plate.height, x + plate.height, 0), fill="#ead9bf", width=3)
    _paper_texture(result)
    shadow = mask.filter(ImageFilter.GaussianBlur(5))
    cyan = _offset_mask(mask, -6, 4)
    coral = _offset_mask(mask, 7, -4)
    result.paste("#facc15", mask=shadow)
    result.paste("#06b6d4", mask=cyan)
    result.paste("#fb7185", mask=coral)
    result.paste("#172554", mask=mask)
    plate.close()
    mask.close()
    shadow.close()
    cyan.close()
    coral.close()
    return result


def riso_split(mask):
    image, _, _ = _drawing_png(mask)
    result = _riso_print(image)
    target = _temporary_path("setta-riso-", ".png")
    try:
        result.save(target, format="PNG", compress_level=1)
        yield {
            "outputs": {},
            "progress": 1,
            "message": "Offsetting cyan, coral, and midnight ink plates",
            "artifacts": [
                {"name": "image", "mediaType": "image/png", "path": str(target)}
            ],
        }
    finally:
        result.close()
        target.unlink(missing_ok=True)


def _embedded_image(reference, expected_media_type, name):
    if reference.get("mediaType") != expected_media_type:
        raise ValueError(f"The {name} result must be {expected_media_type}.")
    path = reference.get("path")
    if not isinstance(path, str) or not path:
        raise ValueError(f"The {name} result path is unavailable.")
    encoded = base64.b64encode(pathlib.Path(path).read_bytes()).decode("ascii")
    return f"data:{expected_media_type};base64,{encoded}"


def _profile_values(profile):
    if not isinstance(profile, dict):
        raise TypeError("The prepared sketch profile is unavailable.")
    edition = profile.get("edition")
    width = profile.get("width")
    height = profile.get("height")
    coverage = profile.get("inkCoverage")
    if not isinstance(edition, str) or not edition.isalnum():
        raise ValueError("The prepared sketch edition is invalid.")
    if not isinstance(width, int) or not isinstance(height, int):
        raise TypeError("The prepared sketch dimensions are invalid.")
    if not isinstance(coverage, (int, float)):
        raise TypeError("The prepared sketch coverage is invalid.")
    return edition[:8], width, height, max(0, min(100, coverage))


def _poster_svg(aurora, riso, profile):
    aurora_image = _embedded_image(aurora, "image/svg+xml", "aurora")
    riso_image = _embedded_image(riso, "image/png", "risograph")
    edition, width, height, coverage = _profile_values(profile)
    return f'''<svg xmlns="http://www.w3.org/2000/svg"
  width="1440" height="900" viewBox="0 0 1440 900">
<defs>
  <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fffaf0"/>
    <stop offset="1" stop-color="#eadfd0"/>
  </linearGradient>
  <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
    <circle cx="2" cy="2" r="1.5" fill="#172554" fill-opacity="0.1"/>
  </pattern>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#172554"
      flood-opacity="0.22"/>
  </filter>
  <clipPath id="riso-frame"><rect x="70" y="372" width="760" height="438" rx="18"/></clipPath>
  <clipPath id="aurora-frame"><rect x="760" y="126" width="610" height="486" rx="26"/></clipPath>
</defs>
<rect width="1440" height="900" fill="url(#paper)"/>
<rect width="1440" height="900" fill="url(#dots)"/>
<rect width="28" height="900" fill="#fb7185"/>
<path d="M28 330H1410" stroke="#172554" stroke-width="2"/>
<text x="72" y="72" fill="#172554" font-family="Arial, sans-serif" font-size="16"
  font-weight="700" letter-spacing="5">SETTA REALTIME / SIGNAL STUDY {edition}</text>
<text x="68" y="174" fill="#172554" font-family="Arial, sans-serif" font-size="92"
  font-weight="900" letter-spacing="-5">DRAW ONCE.</text>
<text x="68" y="258" fill="#e11d48" font-family="Arial, sans-serif" font-size="76"
  font-weight="900" letter-spacing="-4">RENDER TWICE.</text>
<text x="74" y="304" fill="#475569" font-family="Arial, sans-serif" font-size="18"
  font-weight="700" letter-spacing="3">THEN JOIN THE SAME LIVE MOMENT.</text>
<g filter="url(#shadow)" transform="rotate(-2 450 590)">
  <rect x="54" y="356" width="792" height="470" rx="24" fill="#fb7185"/>
  <rect x="70" y="372" width="760" height="438" rx="18" fill="#f6ead5"/>
  <image x="70" y="372" width="760" height="438" preserveAspectRatio="xMidYMid slice"
    href="{riso_image}" clip-path="url(#riso-frame)"/>
  <rect x="94" y="394" width="176" height="34" rx="17" fill="#fffaf0"/>
  <text x="112" y="417" fill="#172554" font-family="Arial, sans-serif" font-size="14"
    font-weight="800" letter-spacing="2">02B / RISO SPLIT</text>
</g>
<g filter="url(#shadow)" transform="rotate(2 1065 370)">
  <rect x="744" y="110" width="642" height="518" rx="34" fill="#22d3ee"/>
  <rect x="760" y="126" width="610" height="486" rx="26" fill="#020617"/>
  <image x="760" y="126" width="610" height="486" preserveAspectRatio="xMidYMid slice"
    href="{aurora_image}" clip-path="url(#aurora-frame)"/>
  <rect x="784" y="150" width="210" height="34" rx="17" fill="#020617" fill-opacity="0.8"
    stroke="#67e8f9"/>
  <text x="802" y="173" fill="#cffafe" font-family="Arial, sans-serif" font-size="14"
    font-weight="800" letter-spacing="2">02A / AURORA BLOOM</text>
</g>
<g transform="translate(902 692)">
  <path d="M0 34H390" stroke="#172554" stroke-width="3"/>
  <circle cx="0" cy="34" r="11" fill="#22d3ee" stroke="#172554" stroke-width="3"/>
  <circle cx="194" cy="34" r="11" fill="#facc15" stroke="#172554" stroke-width="3"/>
  <circle cx="390" cy="34" r="11" fill="#fb7185" stroke="#172554" stroke-width="3"/>
  <text x="0" y="74" fill="#172554" font-family="Arial, sans-serif" font-size="14"
    font-weight="800" letter-spacing="2">01 PREP</text>
  <text x="154" y="74" fill="#172554" font-family="Arial, sans-serif" font-size="14"
    font-weight="800" letter-spacing="2">02 SPLIT</text>
  <text x="344" y="74" fill="#172554" font-family="Arial, sans-serif" font-size="14"
    font-weight="800" letter-spacing="2">03 JOIN</text>
</g>
<text x="902" y="822" fill="#475569" font-family="Arial, sans-serif" font-size="15"
  letter-spacing="1">SOURCE {width}×{height}  /  INK {coverage:.1f}%  /  EDITION {edition}</text>
<text x="1370" y="842" fill="#172554" font-family="Arial, sans-serif" font-size="52"
  font-weight="900" text-anchor="end">LIVE</text>
</svg>'''


def compose_poster(aurora, riso, profile):
    target = _temporary_path("setta-signal-bloom-", ".svg")
    try:
        target.write_text(_poster_svg(aurora, riso, profile), encoding="utf-8")
        yield {
            "outputs": {},
            "progress": 1,
            "message": "Joining both branches into the live editorial poster",
            "artifacts": [
                {"name": "poster", "mediaType": "image/svg+xml", "path": str(target)}
            ],
        }
    finally:
        target.unlink(missing_ok=True)


globals()["handlers"] = {
    "aurora_bloom": aurora_bloom,
    "compose_poster": compose_poster,
    "prepare_sketch": prepare_sketch,
    "riso_split": riso_split,
}

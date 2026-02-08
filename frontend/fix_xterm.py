import re
import sys
from pathlib import Path


def main() -> int:
    # React Flow zoom scales the terminal DOM subtree. xterm's mouse hit-testing
    # assumes unscaled CSS pixels, so selection/clicks can be offset. Patch the
    # compiled bundle to compensate for the CSS scale by deriving the scale
    # factor from the element's bounding box (transforms affect
    # getBoundingClientRect but not offsetWidth/offsetHeight).
    candidates = [
        # Vite prefers the ESM entry (`module`) when available.
        Path("node_modules/@xterm/xterm/lib/xterm.mjs"),
        Path("node_modules/@xterm/xterm/lib/xterm.js"),
        # Back-compat for older lockfiles/worktrees.
        Path("node_modules/xterm/lib/xterm.mjs"),
        Path("node_modules/xterm/lib/xterm.js"),
    ]
    paths = [p for p in candidates if p.exists()]
    if not paths:
        raise FileNotFoundError(
            "Could not find xterm bundle to patch. Tried: "
            + ", ".join(str(p) for p in candidates)
        )

    identifier = r"[A-Za-z_$][\w$]*"
    decl_kw = r"(?:let|const)"

    # xterm exposes a helper for mapping mouse coords into cell coords:
    #   [clientX - rect.left - paddingLeft, clientY - rect.top - paddingTop]
    # When the terminal subtree is CSS-scaled (React Flow zoom), `rect.*` and
    # `client*` are scaled but the padding values are not, and the downstream
    # math is performed in unscaled CSS pixels. We must divide the deltas by the
    # element's effective scale before subtracting padding.
    get_coords = re.compile(
        rf"function\s+(?P<fn>{identifier})\s*"
        rf"\(\s*(?P<win>{identifier})\s*,\s*(?P<evt>{identifier})\s*,\s*(?P<el>{identifier})\s*\)\s*"
        rf"\{{\s*(?P<decl>{decl_kw})\s+"
        rf"(?P<rect>{identifier})\s*=\s*(?P=el)\.getBoundingClientRect\(\)\s*,\s*"
        rf"(?P<style>{identifier})\s*=\s*(?P=win)\.getComputedStyle\(\s*(?P=el)\s*\)\s*,\s*"
        rf"(?P<pad_x>{identifier})\s*=\s*parseInt\(\s*(?P=style)\.getPropertyValue\(\"padding-left\"\)\s*\)\s*,\s*"
        rf"(?P<pad_y>{identifier})\s*=\s*parseInt\(\s*(?P=style)\.getPropertyValue\(\"padding-top\"\)\s*\)\s*;\s*"
        rf"return\s*\[\s*(?P<x_expr>[^,]+?)\s*,\s*(?P<y_expr>[^\]]+?)\s*\]\s*\}}"
    )

    def repl(match: re.Match[str]) -> str:
        fn = match.group("fn")
        win = match.group("win")
        evt = match.group("evt")
        el = match.group("el")
        decl = match.group("decl")
        rect = match.group("rect")
        style = match.group("style")
        pad_x = match.group("pad_x")
        pad_y = match.group("pad_y")
        zoom_x = f"(({rect}.width)/({el}.offsetWidth||{rect}.width)||1)"
        zoom_y = f"(({rect}.height)/({el}.offsetHeight||{rect}.height)||1)"
        return (
            f"function {fn}({win},{evt},{el})"
            "{"
            f"{decl} {rect}={el}.getBoundingClientRect(),"
            f"{style}={win}.getComputedStyle({el}),"
            f'{pad_x}=parseInt({style}.getPropertyValue("padding-left")),'  # noqa: ISC003
            f'{pad_y}=parseInt({style}.getPropertyValue("padding-top"));'  # noqa: ISC003
            f"return[({evt}.clientX-{rect}.left)/{zoom_x}-{pad_x},"
            f"({evt}.clientY-{rect}.top)/{zoom_y}-{pad_y}]"
            "}"
        )

    for path in paths:
        filedata = path.read_text(encoding="utf-8")

        if get_coords.search(filedata) is None:
            raise RuntimeError(
                "xterm reactFlowZoom patch failed: did not find a supported "
                f"getCoordsRelativeToElement snippet ({path})"
            )

        patched, count = get_coords.subn(repl, filedata)
        if count != 1:
            raise RuntimeError(
                "xterm reactFlowZoom patch failed: expected 1 replacement, "
                f"got {count} ({path})"
            )

        if patched == filedata:
            continue

        path.write_text(patched, encoding="utf-8")
        print(f"patched xterm mouse coords for react flow zoom: {path}")

    # Succeed even if everything was already patched.
    return 0


if __name__ == "__main__":
    sys.exit(main())

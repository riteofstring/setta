import re
import sys
from pathlib import Path


def main() -> int:
    # React Flow zoom scales the terminal DOM subtree. xterm's mouse hit-testing
    # assumes unscaled CSS pixels, so selection/clicks can be offset. Patch the
    # compiled bundle to compensate for `globalThis.reactFlowZoom`.
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

    zoom = "(globalThis.reactFlowZoom||1)"
    identifier = r"[A-Za-z_$][\w$]*"
    zoom_re = r"\(globalThis\.reactFlowZoom\|\|1\)"

    # xterm 6+ subtracts padding from the client coords:
    #   [clientX - rect.left - paddingLeft, clientY - rect.top - paddingTop]
    # When the terminal subtree is CSS-scaled (React Flow zoom), `rect.*` and
    # `client*` are scaled but the padding values are not. We must divide the
    # delta by zoom *before* subtracting padding to stay in xterm's unscaled
    # coordinate system.
    already_patched = re.compile(
        rf"\[\((?P<evt>{identifier})\.clientX-(?P<rect>{identifier})\.left\)/{zoom_re}-(?P<pad_x>{identifier}),"
        rf"\((?P<evt_y>{identifier})\.clientY-(?P=rect)\.top\)/{zoom_re}-(?P<pad_y>{identifier})\]"
    )
    old_patched = re.compile(
        rf"\[\((?P<evt>{identifier})\.clientX-(?P<rect>{identifier})\.left-(?P<pad_x>{identifier})\)/{zoom_re},"
        rf"\((?P<evt_y>{identifier})\.clientY-(?P=rect)\.top-(?P<pad_y>{identifier})\)/{zoom_re}\]"
    )
    unpatched = re.compile(
        rf"\[(?P<evt>{identifier})\.clientX-(?P<rect>{identifier})\.left-(?P<pad_x>{identifier}),"
        rf"(?P<evt_y>{identifier})\.clientY-(?P=rect)\.top-(?P<pad_y>{identifier})\]"
    )

    def repl(match: re.Match[str]) -> str:
        evt = match.group("evt")
        rect = match.group("rect")
        pad_x = match.group("pad_x")
        evt_y = match.group("evt_y")
        pad_y = match.group("pad_y")
        return (
            f"[({evt}.clientX-{rect}.left)/{zoom}-{pad_x},"
            f"({evt_y}.clientY-{rect}.top)/{zoom}-{pad_y}]"
        )

    for path in paths:
        filedata = path.read_text(encoding="utf-8")
        if already_patched.search(filedata):
            continue

        patched, count = old_patched.subn(repl, filedata)
        if count == 0:
            patched, count = unpatched.subn(repl, filedata)

        if count == 0:
            raise RuntimeError(
                "xterm reactFlowZoom patch failed: did not find a supported "
                f"mouse-coords snippet ({path})"
            )
        if count != 1:
            raise RuntimeError(
                f"xterm reactFlowZoom patch failed: expected 1 replacement, got {count} ({path})"
            )

        path.write_text(patched, encoding="utf-8")
        print(f"patched xterm mouse coords for react flow zoom: {path}")

    # Succeed even if everything was already patched.
    return 0


if __name__ == "__main__":
    sys.exit(main())

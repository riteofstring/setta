from pathlib import Path
import re
import sys


def main() -> int:
    # React Flow zoom scales the terminal DOM subtree. xterm's mouse hit-testing
    # assumes unscaled CSS pixels, so selection/clicks can be offset. Patch the
    # compiled bundle to divide mouse coords by `globalThis.reactFlowZoom`.
    candidates = [
        Path("node_modules/@xterm/xterm/lib/xterm.js"),
        # Back-compat for older lockfiles/worktrees.
        Path("node_modules/xterm/lib/xterm.js"),
    ]
    path = next((p for p in candidates if p.exists()), None)
    if not path:
        raise FileNotFoundError(
            "Could not find xterm bundle to patch. Tried: "
            + ", ".join(str(p) for p in candidates)
        )

    filedata = path.read_text(encoding="utf-8")
    if "reactFlowZoom" in filedata:
        # Already patched.
        return 0

    # Fast path: stable minified snippet used by xterm's mouse coord helper.
    # This is what we patched historically; keep it as the most reliable option.
    needle = "[t.clientX-s.left-n,t.clientY-s.top-o]"
    zoom = "(globalThis.reactFlowZoom||1)"
    replacement = f"[(t.clientX-s.left-n)/{zoom},(t.clientY-s.top-o)/{zoom}]"
    if needle in filedata:
        patched = filedata.replace(needle, replacement, 1)
        path.write_text(patched, encoding="utf-8")
        print(f"patched xterm mouse coords for react flow zoom: {path}")
        return 0

    # Fallback: best-effort regex patch if the minified variable names change.
    # Match a `return[<exprX>,<exprY>]` where exprX/exprY reference clientX/Y.
    pattern = re.compile(
        r"return\[(?P<x>[^\]]*?clientX[^\],]*?),(?P<y>[^\]]*?clientY[^\]]*?)\]"
    )

    def repl(match: re.Match[str]) -> str:
        x = match.group("x")
        y = match.group("y")
        return f"return[({x})/{zoom},({y})/{zoom}]"

    patched, count = pattern.subn(repl, filedata)
    if count != 1:
        raise RuntimeError(
            f"xterm reactFlowZoom patch failed: expected 1 replacement, got {count} ({path})"
        )

    path.write_text(patched, encoding="utf-8")
    print(f"patched xterm mouse coords for react flow zoom: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

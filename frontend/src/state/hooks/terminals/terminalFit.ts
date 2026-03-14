import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

function patchWrappedFlagsForWidenReflow(terminal: Terminal, oldCols: number) {
  // xterm only reflows lines that are marked as wrapped (`isWrapped=true` on the
  // continuation line). Some shells (notably zsh/ZLE) can redraw long command
  // lines using explicit cursor movement/linefeeds, which results in visually
  // wrapped lines that are not marked as wrapped, so widen reflow can't join
  // them. This patch heuristically marks recent "hard wrapped" lines as wrapped
  // just before we resize wider, so xterm can reflow them.
  //
  // This intentionally only scans near the cursor to reduce the chance of
  // corrupting scrollback that contains real newlines of exactly `oldCols`.
  const active = terminal.buffer.active;
  if (typeof active.length !== "number" || active.length <= 0) {
    return;
  }
  const absCursorY = active.baseY + active.cursorY;
  const scanStart = Math.max(1, absCursorY - 400);
  // Do not patch the wrapped group containing the cursor. xterm will skip
  // reflowing wrapped groups that contain the cursor when `reflowCursorLine`
  // is disabled (the default), so marking the prompt/current input as wrapped
  // can prevent the very reflow we're trying to enable for *previous* lines.
  //
  // Use xterm's current wrap flags to find the first line in the cursor's
  // wrapped group (usually the shell prompt + current input).
  let cursorGroupStart = absCursorY;
  while (cursorGroupStart > 0) {
    const line = active.getLine(cursorGroupStart);
    if (!line || !line.isWrapped) {
      break;
    }
    cursorGroupStart -= 1;
  }
  const scanEnd = Math.min(active.length - 1, cursorGroupStart - 1);

  const anyTerminal = terminal as any;
  const bufferService = anyTerminal?._core?._bufferService;
  const internalBuffer =
    bufferService?.buffer ?? bufferService?.buffers?.active ?? null;
  const internalLines =
    internalBuffer?.lines ??
    internalBuffer?._lines ??
    bufferService?.buffers?.active?.lines ??
    null;

  const readInternalLine = (lineView: any, y: number) => {
    if (lineView && typeof lineView === "object") {
      // xterm BufferLineApiView often keeps a reference to the internal line.
      if ("_line" in lineView) {
        return lineView._line;
      }
      if ("_bufferLine" in lineView) {
        return lineView._bufferLine;
      }
    }
    return internalLines?.get?.(y) ?? internalBuffer?.getLine?.(y) ?? null;
  };

  for (let y = scanStart; y <= scanEnd; y += 1) {
    const prevView = active.getLine(y - 1) as any;
    const lineView = active.getLine(y) as any;

    const prev = readInternalLine(prevView, y - 1);
    const line = readInternalLine(lineView, y);
    if (!prev || !line) {
      continue;
    }

    if (line.isWrapped) {
      continue;
    }

    const lineTrimmedLength =
      typeof line.getTrimmedLength === "function"
        ? line.getTrimmedLength()
        : typeof lineView?.translateToString === "function"
          ? lineView.translateToString(true).length
          : 0;
    if (lineTrimmedLength === 0) {
      continue;
    }

    // Only consider this a wrap continuation when the previous line is "full".
    // This mirrors xterm's own wrapping semantics and matches shells that break
    // the input line at the right margin.
    const prevTrimmedLength =
      typeof prev.getTrimmedLength === "function"
        ? prev.getTrimmedLength()
        : typeof prevView?.translateToString === "function"
          ? prevView.translateToString(true).length
          : 0;
    if (prevTrimmedLength !== oldCols && prevTrimmedLength !== oldCols - 1) {
      continue;
    }

    if (prevTrimmedLength === oldCols) {
      // Bail if the last cell is blank/space. (TrimmedLength should already
      // exclude whitespace, but guard anyway.)
      const lastCodePoint =
        typeof prev.getCodePoint === "function"
          ? prev.getCodePoint(oldCols - 1)
          : null;
      if (lastCodePoint === 0 || lastCodePoint === 32 || lastCodePoint === 9) {
        continue;
      }
    }

    if ("isWrapped" in line) {
      line.isWrapped = true;
    } else if ("_isWrapped" in line) {
      line._isWrapped = true;
    }
  }
}

function getDomScrollBarWidth(terminal: Terminal): number {
  if (terminal.options.scrollback === 0) {
    return 0;
  }
  const element = terminal.element;
  if (!element) {
    return 0;
  }
  const viewport = element.querySelector(".xterm-viewport");
  if (!(viewport instanceof HTMLElement)) {
    return 0;
  }
  return Math.max(0, viewport.offsetWidth - viewport.clientWidth);
}

function proposeDimensionsFallback(terminal: Terminal): {
  cols: number;
  rows: number;
} | null {
  // Avoid crashing on addon-fit bugs/mismatched versions by computing the
  // dimensions ourselves using xterm internals + DOM measurements.
  const element = terminal.element;
  if (!element || !element.parentElement) {
    return null;
  }
  const parentElement = element.parentElement;
  const anyTerminal = terminal as any;
  const dims = anyTerminal?._core?._renderService?.dimensions;
  const cellWidth = dims?.css?.cell?.width;
  const cellHeight = dims?.css?.cell?.height;
  if (
    typeof cellWidth !== "number" ||
    typeof cellHeight !== "number" ||
    cellWidth === 0 ||
    cellHeight === 0
  ) {
    return null;
  }

  const parentHeight = parentElement.clientHeight;
  const parentWidth = parentElement.clientWidth;
  if (
    !Number.isFinite(parentHeight) ||
    !Number.isFinite(parentWidth) ||
    parentHeight <= 0 ||
    parentWidth <= 0
  ) {
    return null;
  }

  const termStyle = window.getComputedStyle(element);
  const paddingTop = parseFloat(termStyle.getPropertyValue("padding-top"));
  const paddingBottom = parseFloat(
    termStyle.getPropertyValue("padding-bottom"),
  );
  const paddingLeft = parseFloat(termStyle.getPropertyValue("padding-left"));
  const paddingRight = parseFloat(termStyle.getPropertyValue("padding-right"));
  if (
    !Number.isFinite(paddingTop) ||
    !Number.isFinite(paddingBottom) ||
    !Number.isFinite(paddingLeft) ||
    !Number.isFinite(paddingRight)
  ) {
    return null;
  }

  const availableHeight = parentHeight - (paddingTop + paddingBottom);
  const availableWidth =
    parentWidth - (paddingLeft + paddingRight) - getDomScrollBarWidth(terminal);
  return {
    cols: Math.max(2, Math.floor(availableWidth / cellWidth)),
    rows: Math.max(1, Math.floor(availableHeight / cellHeight)),
  };
}

export function fitTerminal({
  container,
  fitAddon,
  terminal,
}: {
  container: HTMLDivElement;
  fitAddon: FitAddon;
  terminal: Terminal;
}) {
  // Avoid fitting while the container is effectively hidden, which can result
  // in 0x0 proposals and a "blank" terminal until the next resize.
  if (container.clientWidth < 16 || container.clientHeight < 16) {
    return;
  }
  let proposed: { cols: number; rows: number } | null = null;
  const anyFitAddon = fitAddon as any;
  const proposeDisabled = Boolean(anyFitAddon.__settaProposeDisabled);
  if (!proposeDisabled) {
    try {
      const next = fitAddon.proposeDimensions();
      if (
        next &&
        typeof next.cols === "number" &&
        typeof next.rows === "number"
      ) {
        proposed = { cols: next.cols, rows: next.rows };
      }
    } catch {
      // When addon-fit is mismatched with the xterm major version, proposeDimensions
      // can reliably throw. Disable subsequent propose calls for this instance to
      // avoid spamming logs and keep resizing responsive.
      anyFitAddon.__settaProposeDisabled = true;
    }
  }
  if (!proposed) {
    proposed = proposeDimensionsFallback(terminal);
  }
  if (!proposed) {
    return;
  }

  if (proposed.cols > terminal.cols && terminal.cols > 0) {
    patchWrappedFlagsForWidenReflow(terminal, terminal.cols);
  }
  if (
    proposed.cols > 0 &&
    proposed.rows > 0 &&
    (terminal.cols !== proposed.cols || terminal.rows !== proposed.rows)
  ) {
    const anyTerminal = terminal as any;
    const clear = anyTerminal?._core?._renderService?.clear;
    if (typeof clear === "function") {
      clear.call(anyTerminal._core._renderService);
    }
    terminal.resize(proposed.cols, proposed.rows);
  }
}

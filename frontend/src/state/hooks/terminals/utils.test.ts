/* @vitest-environment jsdom */

import { useMisc } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasActiveTerminalScrollSensitivityConsumers,
  scrollSensitivityUpdater,
} from "./utils";

function createTerminalStub() {
  let onRenderCallback: (() => void) | null = null;

  return {
    terminal: {
      buffer: { active: { baseY: 0 } },
      onRender(callback: () => void) {
        onRenderCallback = callback;
        return {
          dispose() {
            onRenderCallback = null;
          },
        };
      },
      options: {
        scrollSensitivity: 1,
      },
    },
    setBaseY(nextBaseY: number) {
      this.terminal.buffer.active.baseY = nextBaseY;
    },
    triggerRender() {
      onRenderCallback?.();
    },
  };
}

describe("terminal scroll sensitivity updater", () => {
  afterEach(() => {
    resetProjectStores();
  });

  it("tracks active terminal consumers and mirrors pan-scrolling into xterm sensitivity", () => {
    const terminalStub = createTerminalStub();
    const setHasScrollbar = vi.fn();

    expect(hasActiveTerminalScrollSensitivityConsumers()).toBe(false);

    const cleanup = scrollSensitivityUpdater(
      terminalStub.terminal,
      setHasScrollbar,
    );

    expect(hasActiveTerminalScrollSensitivityConsumers()).toBe(true);

    terminalStub.setBaseY(3);
    terminalStub.triggerRender();
    expect(setHasScrollbar).toHaveBeenCalledWith(true);

    useMisc.setState({ isPanScrolling: true });
    expect(terminalStub.terminal.options.scrollSensitivity).toBe(
      Number.MIN_VALUE,
    );

    useMisc.setState({ isPanScrolling: false });
    expect(terminalStub.terminal.options.scrollSensitivity).toBe(1);

    cleanup();

    expect(hasActiveTerminalScrollSensitivityConsumers()).toBe(false);
  });

  it("resets the pan-scrolling misc flag when the last terminal consumer unmounts", () => {
    const terminalStub = createTerminalStub();
    const setMiscStateSpy = vi.spyOn(useMisc, "setState");
    const cleanup = scrollSensitivityUpdater(terminalStub.terminal, vi.fn());

    useMisc.setState({ isPanScrolling: true });
    expect(useMisc.getState().isPanScrolling).toBe(true);

    cleanup();

    expect(useMisc.getState().isPanScrolling).toBe(false);
    expect(setMiscStateSpy).toHaveBeenLastCalledWith({
      isPanScrolling: false,
    });
  });
});

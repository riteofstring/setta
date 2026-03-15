import { describe, expect, it } from "vitest";
import {
  getPressedKeys,
  handlePressedKeyRelease,
  noteModShortcutPressed,
  recordPressedKey,
  resetPressedKeyState,
  startKeyDownCycle,
} from "./keyActivationPressedKeys";

describe("keyActivationPressedKeys", () => {
  it("clears stale pressed keys after a mod shortcut cycle", () => {
    // The pressed-key store should drop stale non-modifier keys before the next
    // keydown pass when the previous shortcut involved the mod key.
    resetPressedKeyState();
    recordPressedKey("KeyA", 0);
    noteModShortcutPressed();

    startKeyDownCycle(200);

    expect(Array.from(getPressedKeys())).toEqual([]);
    resetPressedKeyState();
  });

  it("resets the pressed-key store on macOS Meta key release", () => {
    // Releasing Meta on macOS should clear the full pressed-key set so the
    // listener does not keep stale modifier combos alive.
    resetPressedKeyState();
    recordPressedKey("KeyA", 0);
    recordPressedKey("KeyB", 0);

    handlePressedKeyRelease({
      eventCode: "MetaLeft",
      eventKey: "Meta",
      isMacOsHost: true,
    });

    expect(Array.from(getPressedKeys())).toEqual([]);
    resetPressedKeyState();
  });
});

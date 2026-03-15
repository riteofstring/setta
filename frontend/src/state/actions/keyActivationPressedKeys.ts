let keysPressed = new Set<string>();
let keysPressedTimeStamps = new Map<string, number>();
let modShortcutWasPressed = false;

function deletePressedKey(key: string) {
  keysPressed.delete(key);
  keysPressedTimeStamps.delete(key);
}

function clearStalePressedKeys(nowMs: number) {
  for (const [key, timestamp] of keysPressedTimeStamps) {
    if (nowMs - timestamp > 100) {
      deletePressedKey(key);
    }
  }
}

export function getPressedKeys(): Set<string> {
  return keysPressed;
}

export function resetPressedKeyState() {
  keysPressed = new Set<string>();
  keysPressedTimeStamps = new Map<string, number>();
}

export function startKeyDownCycle(nowMs: number = Date.now()) {
  if (modShortcutWasPressed) {
    clearStalePressedKeys(nowMs);
  }
  modShortcutWasPressed = false;
}

export function recordPressedKey(key: string, nowMs: number = Date.now()) {
  keysPressed.add(key);
  keysPressedTimeStamps.set(key, nowMs);
}

export function noteModShortcutPressed() {
  modShortcutWasPressed = true;
}

export function hasPressedModShortcut(): boolean {
  return modShortcutWasPressed;
}

export function clearPressedModShortcut() {
  modShortcutWasPressed = false;
}

export function handlePressedKeyRelease({
  eventCode,
  eventKey,
  isMacOsHost,
}: {
  eventCode: string | null;
  eventKey: string;
  isMacOsHost: boolean;
}) {
  if (isMacOsHost && eventKey === "Meta") {
    resetPressedKeyState();
    return;
  }
  if (eventCode) {
    deletePressedKey(eventCode);
  }
}

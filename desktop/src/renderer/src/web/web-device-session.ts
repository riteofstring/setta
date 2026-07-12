const webDeviceStorageKey = "setta.web.device-session.v1";

export interface StoredWebDeviceSession {
  deviceId: string;
  deviceToken: string;
  pairedAt: string;
  protocolVersion: number;
  runtimeId: string;
}

export function saveStoredDeviceSession(session: StoredWebDeviceSession): void {
  localStorage.setItem(webDeviceStorageKey, JSON.stringify(session));
}

export function loadStoredDeviceSession(): StoredWebDeviceSession | null {
  const raw = localStorage.getItem(webDeviceStorageKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredWebDeviceSession(parsed)) {
      return parsed;
    }
  } catch {
    // Invalid device records are cleared below.
  }
  clearStoredDeviceSession();
  return null;
}

export function clearStoredDeviceSession(): void {
  localStorage.removeItem(webDeviceStorageKey);
}

function isStoredWebDeviceSession(value: unknown): value is StoredWebDeviceSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<Record<keyof StoredWebDeviceSession, unknown>>;
  return (
    typeof record.deviceId === "string" &&
    typeof record.deviceToken === "string" &&
    typeof record.pairedAt === "string" &&
    typeof record.protocolVersion === "number" &&
    typeof record.runtimeId === "string"
  );
}

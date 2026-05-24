const SETTA_CHROME_REPRO_MESSAGE_SOURCE =
  "setta.chrome-repro-recorder/app-state";

declare global {
  interface Window {
    __SETTA_CHROME_REPRO_ACTIVE__?: boolean;
  }
}

export function postChromeReproEvent(
  kind: string,
  payload: Record<string, unknown>,
): void {
  if (!isChromeReproActive()) {
    return;
  }
  window.postMessage(
    {
      source: SETTA_CHROME_REPRO_MESSAGE_SOURCE,
      type: "app-state",
      kind,
      timestampMs: Date.now(),
      payload,
    },
    "*",
  );
}

export function isChromeReproActive(): boolean {
  return (
    typeof window !== "undefined" &&
    window.__SETTA_CHROME_REPRO_ACTIVE__ === true
  );
}

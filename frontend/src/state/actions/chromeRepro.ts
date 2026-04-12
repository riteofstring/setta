export const SETTA_CHROME_REPRO_MESSAGE_SOURCE =
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
  if (typeof window === "undefined") {
    return;
  }
  if (window.__SETTA_CHROME_REPRO_ACTIVE__ !== true) {
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

import type { DesktopPlatform, RuntimeVersions } from "@shared/types";

export function transparentSVGDataURL(width: number, height: number): string {
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${Math.max(
    1,
    Math.round(width),
  )}' height='${Math.max(1, Math.round(height))}'/%3E`;
}

export function webRuntimeVersions(): RuntimeVersions {
  return {
    app: "web",
    chrome: "",
    electron: "",
    node: "",
  };
}

export function detectWebPlatform(): DesktopPlatform {
  const platform = navigator.userAgent.includes("Android") ? "android" : "linux";
  return platform;
}

export function webDeviceDisplayName(): string {
  return navigator.userAgent.includes("Android") ? "Setta Android PWA" : "Setta Web";
}

export function sameOriginBaseURL(): string {
  const url = new URL(window.location.origin);
  url.pathname = "/";
  return url.toString();
}

export function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

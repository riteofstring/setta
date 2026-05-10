import { BootstrapProtocol } from "utils/generatedTypes";
import { persistLauncherOrigin } from "utils/launcherOrigin";

function getLauncherOriginHandoffUrl(): URL | null {
  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function cleanLauncherOriginHandoffUrl(nextUrl: string): void {
  try {
    window.history.replaceState(window.history.state, "", nextUrl);
    return;
  } catch {
    // Some browsers/extensions can leave a non-cloneable state in history.state.
    // Falling back to null is better than leaving the handoff URL behind.
  }
  try {
    window.history.replaceState(null, "", nextUrl);
  } catch (error) {
    console.warn("Failed to clean launcher origin handoff from URL", error);
    try {
      window.location.replace(nextUrl);
    } catch {
      // ignore
    }
  }
}

export function applyLauncherOriginHandoffFromUrl(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = getLauncherOriginHandoffUrl();
  if (!url) {
    return;
  }

  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash || "");
  const rawLauncherOrigin = hashParams.get(
    BootstrapProtocol.launcherOriginHashParam,
  );
  const rawLauncherOriginProof = hashParams.get(
    BootstrapProtocol.launcherOriginProofHashParam,
  );
  if (!rawLauncherOrigin) {
    return;
  }

  if (rawLauncherOriginProof?.trim()) {
    persistLauncherOrigin(rawLauncherOrigin);
  }

  hashParams.delete(BootstrapProtocol.launcherOriginHashParam);
  hashParams.delete(BootstrapProtocol.launcherOriginProofHashParam);
  url.hash = hashParams.toString();
  cleanLauncherOriginHandoffUrl(url.toString());
}

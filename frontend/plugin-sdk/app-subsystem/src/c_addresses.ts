import { C } from "./c";
import { TransportRouteConstants } from "./generatedTypes";
import { getOrInitLauncherOrigin } from "./launcherOrigin";
import { normalizeOrigin } from "./origin";
import { safeSessionStorage } from "./storage";

const BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY = "setta.backendOriginOverride";

export class C_ADDRESSES {
  static get DEV_MODE() {
    return import.meta.env?.DEV;
  }

  static get DEV_BACKEND_ORIGIN_SESSION_OVERRIDE() {
    const storage = safeSessionStorage();
    if (!storage) {
      return undefined;
    }
    try {
      const rawOverride = storage.getItem(BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY);
      if (!rawOverride) {
        return undefined;
      }
      return normalizeOrigin(
        rawOverride,
        "backend origin override (sessionStorage)",
      );
    } catch (error) {
      console.warn(
        "Failed to read backend origin override from sessionStorage",
        error,
      );
      return undefined;
    }
  }

  static get DEV_BACKEND_ORIGIN_OVERRIDE() {
    const override = import.meta.env?.VITE_BACKEND_ORIGIN as string | undefined;
    if (!override) {
      return undefined;
    }
    return normalizeOrigin(override, "VITE_BACKEND_ORIGIN");
  }

  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      const sessionOverride = this.DEV_BACKEND_ORIGIN_SESSION_OVERRIDE;
      if (sessionOverride) {
        return sessionOverride;
      }
      const override = this.DEV_BACKEND_ORIGIN_OVERRIDE;
      if (override) {
        return override;
      }
      return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    }
    return location.origin;
  }

  static get LAUNCHER_ORIGIN() {
    if (!this.DEV_MODE) {
      return getOrInitLauncherOrigin(location.origin);
    }

    const override = this.DEV_BACKEND_ORIGIN_OVERRIDE;
    if (override) {
      return getOrInitLauncherOrigin(override);
    }

    let fallback = `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    try {
      const backendUrl = new URL(this.BACKEND_ORIGIN);
      if (backendUrl.protocol === "http:" || backendUrl.protocol === "https:") {
        const hostname = backendUrl.hostname.includes(":")
          ? `[${backendUrl.hostname}]`
          : backendUrl.hostname;
        fallback = `${backendUrl.protocol}//${hostname}:${C.DEFAULT_PORT}`;
      }
    } catch {
      // Ignore invalid origin values and keep the default fallback.
    }
    return getOrInitLauncherOrigin(fallback);
  }

  static get LAUNCHER() {
    return `${this.LAUNCHER_ORIGIN}${TransportRouteConstants.apiPrefix}`;
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${TransportRouteConstants.apiPrefix}`;
  }

  static get WEBSOCKET() {
    const originUrl = new URL(this.BACKEND_ORIGIN);
    const protocol =
      originUrl.protocol === "https:" || originUrl.protocol === "wss:"
        ? "wss:"
        : "ws:";
    return `${protocol}//${originUrl.host}${TransportRouteConstants.apiPrefix}`;
  }
}

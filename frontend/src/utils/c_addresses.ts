import { BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY } from "utils/backendOriginOverride";
import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";
import { getOrInitLauncherOrigin } from "utils/launcherOrigin";
import { normalizeOrigin } from "utils/origin";

export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  static get DEV_BACKEND_ORIGIN_SESSION_OVERRIDE() {
    if (typeof sessionStorage === "undefined") {
      return undefined;
    }
    try {
      const rawOverride = sessionStorage.getItem(
        BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY,
      );
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

  // Computed properties that mirror the Python class
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
    if (this.DEV_MODE) {
      const fallback =
        this.DEV_BACKEND_ORIGIN_OVERRIDE ??
        this.DEV_BACKEND_ORIGIN_SESSION_OVERRIDE ??
        `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
      return getOrInitLauncherOrigin(fallback);
    }
    return getOrInitLauncherOrigin(location.origin);
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${RouteEnum.PREFIX}`;
  }

  static get LAUNCHER() {
    return `${this.LAUNCHER_ORIGIN}${RouteEnum.PREFIX}`;
  }

  static get WEBSOCKET() {
    const originUrl = new URL(this.BACKEND_ORIGIN);
    const protocol =
      originUrl.protocol === "https:" || originUrl.protocol === "wss:"
        ? "wss:"
        : "ws:";
    return `${protocol}//${originUrl.host}${RouteEnum.PREFIX}`;
  }
}

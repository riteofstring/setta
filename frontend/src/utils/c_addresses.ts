import { BACKEND_ORIGIN_OVERRIDE_STORAGE_KEY } from "utils/backendOriginOverride";
import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";

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
      return this.normalizeOrigin(rawOverride);
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
    return this.normalizeOrigin(override);
  }

  static normalizeOrigin(origin: string) {
    let normalizedOrigin = origin.trim();
    if (!normalizedOrigin) {
      return undefined;
    }
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedOrigin);
    if (!hasProtocol) {
      normalizedOrigin = `http://${normalizedOrigin}`;
    }
    try {
      return new URL(normalizedOrigin).origin;
    } catch (error) {
      console.error(
        `Invalid VITE_BACKEND_ORIGIN value "${origin}". Falling back to default origin.`,
        error,
      );
      return undefined;
    }
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

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${RouteEnum.PREFIX}`;
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

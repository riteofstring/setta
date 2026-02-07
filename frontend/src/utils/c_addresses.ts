import { C } from "utils/c";
import {
  normalizeOrigin,
  readBackendOriginOverrideFromStorage,
} from "utils/backendOriginOverride";
import { RouteEnum } from "utils/generatedTypes";

export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  static get DEV_BACKEND_ORIGIN_RUNTIME_OVERRIDE() {
    return readBackendOriginOverrideFromStorage();
  }

  static get DEV_BACKEND_ORIGIN_OVERRIDE() {
    const override = import.meta.env?.VITE_BACKEND_ORIGIN as string | undefined;
    if (!override) {
      return undefined;
    }
    return normalizeOrigin(override);
  }

  // Computed properties that mirror the Python class
  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      const runtimeOverride = this.DEV_BACKEND_ORIGIN_RUNTIME_OVERRIDE;
      if (runtimeOverride) {
        return runtimeOverride;
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

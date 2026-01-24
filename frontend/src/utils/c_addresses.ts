import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";

export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  static normalizeOrigin(origin: string): string {
    if (!origin) {
      return origin;
    }
    return origin.endsWith("/") ? origin.slice(0, -1) : origin;
  }

  static resolveDevBackendOrigin(): string {
    const envOrigin = import.meta.env?.VITE_BACKEND_ORIGIN;
    if (envOrigin) {
      return this.normalizeOrigin(envOrigin);
    }
    return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
  }

  static resolveDevWebsocketOrigin(): string {
    const backendOrigin = this.resolveDevBackendOrigin();
    if (backendOrigin.startsWith("https://")) {
      return `wss://${backendOrigin.slice("https://".length)}`;
    }
    if (backendOrigin.startsWith("http://")) {
      return `ws://${backendOrigin.slice("http://".length)}`;
    }
    return `ws://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
  }

  // Computed properties that mirror the Python class
  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      return this.resolveDevBackendOrigin();
    }
    return location.origin;
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${RouteEnum.PREFIX}`;
  }

  static get WEBSOCKET() {
    if (this.DEV_MODE) {
      return `${this.resolveDevWebsocketOrigin()}${RouteEnum.PREFIX}`;
    }
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}${RouteEnum.PREFIX}`;
  }
}

import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";

export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  // Computed properties that mirror the Python class
  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    }
    return location.origin;
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${RouteEnum.PREFIX}`;
  }

  static get WEBSOCKET() {
    if (this.DEV_MODE) {
      return `ws://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}${RouteEnum.PREFIX}`;
    }
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}${RouteEnum.PREFIX}`;
  }
}

import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";

export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  // Computed properties that mirror the Python class
  static get BACKEND_ORIGIN() {
    if (this.DEV_MODE) {
      const backendOrigin = import.meta.env?.VITE_BACKEND_ORIGIN;
      if (backendOrigin) {
        return backendOrigin;
      }
      return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}`;
    }
    return location.origin;
  }

  static get BACKEND() {
    return `${this.BACKEND_ORIGIN}${RouteEnum.PREFIX}`;
  }

  static get WEBSOCKET() {
    if (this.DEV_MODE) {
      const backendWsOrigin = import.meta.env?.VITE_BACKEND_WS_ORIGIN;
      if (backendWsOrigin) {
        return `${backendWsOrigin}${RouteEnum.PREFIX}`;
      }
      const backendOrigin = this.BACKEND_ORIGIN;
      if (backendOrigin.startsWith("https://")) {
        return `wss://${backendOrigin.slice("https://".length)}${
          RouteEnum.PREFIX
        }`;
      }
      if (backendOrigin.startsWith("http://")) {
        return `ws://${backendOrigin.slice("http://".length)}${
          RouteEnum.PREFIX
        }`;
      }
      return `${backendOrigin}${RouteEnum.PREFIX}`;
    }
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${location.host}${RouteEnum.PREFIX}`;
  }
}

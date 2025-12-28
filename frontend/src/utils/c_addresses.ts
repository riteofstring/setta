import { C } from "utils/c";
import { RouteEnum } from "utils/generatedTypes";

export class C_ADDRESSES {
  static DEV_MODE = import.meta.env?.DEV;

  // Computed properties that mirror the Python class
  static get BACKEND() {
    if (this.DEV_MODE) {
      return `http://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}${RouteEnum.PREFIX}`;
    } else {
      return `http://${location.host}${RouteEnum.PREFIX}`;
    }
  }

  static get WEBSOCKET() {
    if (this.DEV_MODE) {
      return `ws://${C.DEFAULT_HOST}:${C.DEFAULT_PORT}${RouteEnum.PREFIX}`;
    } else {
      return `ws://${location.host}${RouteEnum.PREFIX}`;
    }
  }
}

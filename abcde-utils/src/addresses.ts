import { createNewId } from "./utils";

export const DOMAIN = "127.0.0.1";
export const FRONTEND_PORT = 3000;
export const BACKEND_PORT = 8000;
export const BACKEND = `http://${DOMAIN}:${BACKEND_PORT}`;
export const FRONTEND = `http://${DOMAIN}:${FRONTEND_PORT}`;
export function WEBSOCKET() {
  return `ws://${DOMAIN}:${BACKEND_PORT}/${createNewId()}`;
}

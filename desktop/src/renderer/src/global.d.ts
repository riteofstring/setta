import type { SettaAPI } from "@shared/types";

declare global {
  interface Window {
    setta: SettaAPI;
  }
}

export {};

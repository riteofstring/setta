import { describe, expect, it } from "vitest";
import {
  PLUGIN_FRONTEND_API_VERSION,
  PluginPaneIconNameEnum,
} from "./sdk";

describe("plugins sdk exports", () => {
  it("exposes runtime API constants and icon enums", () => {
    expect(PLUGIN_FRONTEND_API_VERSION).toBe(1);
    expect(Object.values(PluginPaneIconNameEnum).length).toBeGreaterThan(0);
  });
});

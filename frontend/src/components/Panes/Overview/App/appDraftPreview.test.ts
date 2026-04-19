import { describe, expect, it } from "vitest";

import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppTheme,
} from "../../../../../../plugins/setta-json-render-app-gen/frontend/src/components/Panes/Overview/App/appDraftPreview";

describe("appDraftPreview", () => {
  describe("parseDraftAppSpec", () => {
    it("treats empty draft as null spec", () => {
      const res = parseDraftAppSpec("   ");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toBeNull();
      }
    });

    it("returns an error for invalid JSON", () => {
      const res = parseDraftAppSpec("{");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Invalid JSON in app spec.");
      }
    });
  });

  describe("parseDraftAppTheme", () => {
    it("returns an object with mode even when the draft is empty", () => {
      const res = parseDraftAppTheme("", "dark");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.mode).toBe("dark");
      }
    });

    it("errors when the theme JSON is invalid", () => {
      const res = parseDraftAppTheme("{", "auto");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Invalid JSON in theme.");
      }
    });

    it("errors when the theme JSON is not an object", () => {
      const res = parseDraftAppTheme("[]", "auto");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Theme JSON must be an object.");
      }
    });
  });

  describe("parseDraftAppAssets", () => {
    it("treats empty draft as an empty list", () => {
      const res = parseDraftAppAssets("  ");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual([]);
      }
    });

    it("errors when assets JSON is invalid", () => {
      const res = parseDraftAppAssets("[");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Invalid JSON in assets.");
      }
    });

    it("errors when assets JSON is not a list", () => {
      const res = parseDraftAppAssets("{}");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Assets JSON must be a list.");
      }
    });
  });
});

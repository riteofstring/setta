import { describe, expect, it } from "vitest";

import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppSpecPayload,
  parseDraftAppTheme,
} from "../../../../../src/components/Panes/Overview/App/appDraftPreview";

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

    it("parses a valid keyed app spec without rewriting it", () => {
      const res = parseDraftAppSpecPayload(`{
        "key": "app-root",
        "type": "Card",
        "props": {
          "title": "Plugin render smoke test",
          "description": "If you can see this card, JSON Render is working."
        },
        "children": [
          {
            "key": "smoke-text",
            "type": "Text",
            "props": {
              "text": "This is a simple app-subsystem render check."
            }
          }
        ]
      }`);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({
          key: "app-root",
          type: "Card",
          props: {
            title: "Plugin render smoke test",
            description: "If you can see this card, JSON Render is working.",
          },
          children: [
            {
              key: "smoke-text",
              type: "Text",
              props: {
                text: "This is a simple app-subsystem render check.",
              },
            },
          ],
        });
      }
    });

    it("does not compatibility-normalize unkeyed JSON render element trees", () => {
      const res = parseDraftAppSpecPayload(`{
        "type": "Card",
        "props": {
          "subtitle": "This is intentionally left for backend validation.",
          "children": [
            {
              "type": "Text",
              "props": {
                "children": "Unsupported Setta app-spec shape."
              }
            }
          ]
        }
      }`);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({
          type: "Card",
          props: {
            subtitle: "This is intentionally left for backend validation.",
            children: [
              {
                type: "Text",
                props: {
                  children: "Unsupported Setta app-spec shape.",
                },
              },
            ],
          },
        });
      }
    });

    it("preserves an already keyed app spec", () => {
      const res = parseDraftAppSpecPayload(`{
        "key": "root",
        "type": "Card",
        "props": { "title": "Existing" }
      }`);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({
          key: "root",
          type: "Card",
          props: { title: "Existing" },
        });
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

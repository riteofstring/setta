/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { WorkspaceItemConfigurationEditor } from "./WorkspaceItemConfigurationEditor";
import {
  createWorkspaceInspectorItemControl,
  WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS,
} from "./workspaceInspectorItemDefaults";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceItemConfigurationEditor", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    registerSectionKinds({ leaf: { renderContent: () => null } });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
  });

  it.each(WORKSPACE_INSPECTOR_ITEM_CONTROL_KINDS)(
    "submits an unchanged valid %s configuration through one mutation",
    async (kind) => {
      const control = createWorkspaceInspectorItemControl(kind, "previous");
      loadWorkspaceDocument({
        sections: {
          leaf: {
            id: "leaf",
            kind: "leaf",
            name: "Leaf",
            size: { width: 240, height: 120 },
            isMinimized: false,
            positionAndSizeLocked: false,
            isHorizontalOrientation: false,
            styleColor: null,
            tagColor: null,
            children: [],
            itemTree: {
              rootId: "root",
              items: {
                root: { id: "root", children: ["item"] },
                item: {
                  id: "item",
                  children: [],
                  presentation: { label: "Item", control },
                },
              },
              selectedItemIds: ["item"],
            },
          },
        },
        topLevelSections: {
          leaf: { x: 0, y: 0, w: 240, h: 120, zIndex: 0 },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
        activeIds: ["leaf"],
      });
      const onChange = vi.fn();
      const onEscape = vi.fn();
      const onStatusChange = vi.fn();
      setWorkspaceDocumentChangeCallback(onChange);

      await act(async () => {
        root.render(
          <WorkspaceItemConfigurationEditor
            control={control}
            disabled={false}
            itemId="item"
            onEscape={onEscape}
            onStatusChange={onStatusChange}
            sectionId="leaf"
          />,
        );
      });
      const submit = host.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!submit) {
        throw new Error(`Expected ${kind} configuration submit button.`);
      }
      await act(async () => {
        submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalledOnce();
      expect(onStatusChange).toHaveBeenCalledWith(`${kind} configuration updated.`);
    },
  );
});

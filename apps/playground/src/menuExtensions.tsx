import {
  GROUP_SECTION_KIND,
  registerWorkspaceCreationCommands,
  registerWorkspaceMenuActions,
  ungroupSections,
  type WorkspaceCreationContext,
  type WorkspaceMenuIconProps,
  type WorkspaceSectionInput,
} from "@setta/workspace";
import { useSyncExternalStore } from "react";

let menuExtensionStatus = "No host menu action invoked.";
const menuExtensionListeners = new Set<() => void>();

function publishMenuExtensionStatus(status: string): void {
  menuExtensionStatus = status;
  for (const listener of menuExtensionListeners) {
    listener();
  }
}

function subscribeMenuExtensionStatus(listener: () => void): () => void {
  menuExtensionListeners.add(listener);
  return () => menuExtensionListeners.delete(listener);
}

function getMenuExtensionStatus(): string {
  return menuExtensionStatus;
}

function PlaygroundCreationIcon({ className }: WorkspaceMenuIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
    >
      <path d="M3 2.5h10v11H3z" />
      <path d="M5.5 6h5M5.5 9h5" />
    </svg>
  );
}

function createPlaygroundLeaf(
  context: WorkspaceCreationContext,
  variant: "note" | "marker",
): WorkspaceSectionInput {
  const id = `playground-${variant}-${crypto.randomUUID()}`;
  const label = variant === "note" ? "Host note" : "Position marker";
  return {
    id,
    kind: "leaf",
    name: label,
    data: {
      body: `${label} created at ${Math.round(context.workspacePosition.x)}, ${Math.round(context.workspacePosition.y)}.`,
    },
    isMinimized: false,
    positionAndSizeLocked: false,
    isHorizontalOrientation: false,
    styleColor: null,
    tagColor: null,
    children: [],
  };
}

export function registerPlaygroundMenuExtensions(): void {
  registerWorkspaceCreationCommands([
    {
      id: "playground-note",
      label: "Host note",
      group: "Playground",
      icon: PlaygroundCreationIcon,
      createSection: (context) => createPlaygroundLeaf(context, "note"),
    },
    {
      id: "playground-marker",
      label: "Position marker",
      group: "Playground",
      createSection: (context) => createPlaygroundLeaf(context, "marker"),
    },
  ]);
  registerWorkspaceMenuActions([
    {
      id: "playground-pane-position",
      scope: "pane",
      label: "Report position",
      onSelect: (context) =>
        publishMenuExtensionStatus(
          `Pane action at ${Math.round(context.workspacePosition.x)}, ${Math.round(context.workspacePosition.y)}.`,
        ),
    },
    {
      id: "playground-section-selection",
      scope: "section",
      label: "Report selection",
      onSelect: (context) =>
        publishMenuExtensionStatus(
          `Section action for ${context.section.name}; ${context.selectedSections.length} selected.`,
        ),
    },
    {
      id: "playground-ungroup-selection",
      scope: "section",
      label: "Ungroup selection",
      isDisabled: (context) =>
        context.selectedSections.length === 0 ||
        context.selectedSections.some(
          (section) => section.kind !== GROUP_SECTION_KIND || section.positionAndSizeLocked,
        ),
      onSelect: (context) => {
        ungroupSections(context.selectedSections.map((section) => section.id));
        publishMenuExtensionStatus("Selection ungrouped through the host action.");
      },
    },
    {
      id: "playground-item-identity",
      scope: "item",
      label: "Report item",
      onSelect: (context) =>
        publishMenuExtensionStatus(`Item action for ${context.section.name}/${context.item.id}.`),
    },
    {
      id: "playground-outline-selection",
      scope: "outline",
      label: "Report Outline row",
      onSelect: (context) =>
        publishMenuExtensionStatus(
          `Outline action for ${context.section.name}; ${context.selectedSections.length} selected.`,
        ),
    },
  ]);
}

export function PlaygroundMenuActionReadout() {
  const status = useSyncExternalStore(
    subscribeMenuExtensionStatus,
    getMenuExtensionStatus,
    getMenuExtensionStatus,
  );
  return <span aria-live="polite">{status}</span>;
}

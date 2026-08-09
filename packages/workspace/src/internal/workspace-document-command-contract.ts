import type {
  SectionOrientation,
  SectionOverflow,
  WorkspaceActionRejectionReason,
  WorkspaceChildLayoutPositioningChange,
  WorkspaceDocument,
  WorkspaceDocumentChangeReason,
  WorkspacePoint,
  WorkspaceSection,
  WorkspaceSectionPresentation,
  WorkspaceViewport,
} from "../core.js";
import type { SectionMovePlan } from "./section-move-planning.js";
import type { WorkspaceClipboardPlacedSections } from "./workspace-clipboard.js";
import type { WorkspaceRootStackingAction } from "./workspace-root-stacking.js";
import type { WorkspaceSectionResizeAxis } from "./workspace-section-sizing.js";

export type WorkspaceDocumentCommand<TSectionData = unknown> =
  | Readonly<{
      position: WorkspacePoint;
      section: WorkspaceSection<TSectionData>;
      type: "create-root-section";
    }>
  | Readonly<{
      paste: WorkspaceClipboardPlacedSections<TSectionData>;
      type: "paste-sections";
    }>
  | Readonly<{ sectionIds: readonly string[]; type: "delete-sections" }>
  | Readonly<{
      group: WorkspaceSection<TSectionData>;
      position: WorkspacePoint | null;
      sectionIds: readonly string[];
      type: "group-sections";
    }>
  | Readonly<{
      positions: Readonly<Record<string, WorkspacePoint>>;
      type: "move-root-sections";
    }>
  | Readonly<{
      plan: SectionMovePlan;
      type: "move-sections";
    }>
  | Readonly<{
      axes: readonly WorkspaceSectionResizeAxis[];
      position: WorkspacePoint;
      sectionId: string;
      size: Readonly<{ height: number; width: number }>;
      type: "resize-root-section";
    }>
  | Readonly<{
      action: WorkspaceRootStackingAction;
      sectionIds: readonly string[];
      type: "stack-root-sections";
    }>
  | Readonly<{
      axes: readonly WorkspaceSectionResizeAxis[];
      sectionId: string;
      type: "set-section-content-size";
    }>
  | Readonly<{
      growWithContentSizing: Readonly<{ height: boolean; width: boolean }>;
      measuredSize: Readonly<{ height: number; width: number }> | null;
      overflow: SectionOverflow;
      sectionId: string;
      type: "set-section-child-overflow";
    }>
  | Readonly<{
      measuredSize: Readonly<{ height: number; width: number }> | null;
      orientation: SectionOrientation;
      sectionId: string;
      type: "set-section-child-orientation";
    }>
  | Readonly<{
      change: WorkspaceChildLayoutPositioningChange;
      measuredSize: Readonly<{ height: number; width: number }> | null;
      sectionId: string;
      type: "set-section-child-positioning";
    }>
  | Readonly<{ isMinimized: boolean; sectionId: string; type: "set-section-minimized" }>
  | Readonly<{
      presentation: WorkspaceSectionPresentation;
      sectionId: string;
      type: "set-section-presentation";
    }>
  | Readonly<{ sectionId: string; title: string; type: "set-section-title" }>
  | Readonly<{ locked: boolean; sectionIds: readonly string[]; type: "set-sections-locked" }>
  | Readonly<{
      positions: Readonly<Record<string, WorkspacePoint>> | null;
      sectionId: string;
      type: "ungroup-section";
    }>
  | Readonly<{ type: "set-viewport"; viewport: WorkspaceViewport }>;

export type WorkspaceDocumentCommandResult<TSectionData> =
  | Readonly<{
      document: WorkspaceDocument<TSectionData>;
      reason: WorkspaceDocumentChangeReason;
      status: "applied";
    }>
  | Readonly<{ document: WorkspaceDocument<TSectionData>; status: "unchanged" }>
  | Readonly<{
      document: WorkspaceDocument<TSectionData>;
      reason: WorkspaceActionRejectionReason;
      status: "rejected";
    }>;

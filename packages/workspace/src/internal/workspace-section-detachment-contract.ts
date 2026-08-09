import type { ReactNode } from "react";

import { optionOverridesAt } from "./runtime-option-validation.js";

export type WorkspaceDetachmentRequest = Readonly<{
  kind: string;
  sectionId: string;
  title: string;
}>;

export type WorkspaceDetachmentDecision =
  Readonly<{ allowed: false; reason: string }> | Readonly<{ allowed: true }>;

export type WorkspaceDetachmentValidator = (
  request: WorkspaceDetachmentRequest,
) => WorkspaceDetachmentDecision;

export type WorkspaceDetachedWindowInitialBounds = Readonly<{
  height?: number;
  width?: number;
  x?: number;
  y?: number;
}>;

export type WorkspaceDetachedWindowBounds = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type WorkspaceDetachedWindowBoundsResolver = (
  request: WorkspaceDetachmentRequest,
) => WorkspaceDetachedWindowInitialBounds | null | undefined;

export type WorkspaceDetachedWindowChange = WorkspaceDetachmentRequest &
  Readonly<{
    bounds: WorkspaceDetachedWindowBounds;
    open: boolean;
  }>;

export type WorkspaceDetachedWindowChangeHandler = (change: WorkspaceDetachedWindowChange) => void;

export type WorkspaceDetachedWindowHeadRenderer = (
  request: WorkspaceDetachmentRequest,
) => ReactNode;

export type WorkspaceDetachmentProviderProps = Readonly<{
  children: ReactNode;
  getInitialWindowBounds?: WorkspaceDetachedWindowBoundsResolver;
  onWindowChange?: WorkspaceDetachedWindowChangeHandler;
  renderWindowHead?: WorkspaceDetachedWindowHeadRenderer;
  validateDetachment?: WorkspaceDetachmentValidator;
}>;

const decisionKeys = ["allowed", "reason"] as const;
const initialBoundsKeys = ["height", "width", "x", "y"] as const;
const defaultInitialBounds = Object.freeze({ height: 560, width: 720 });

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  const resolved = finiteNumber(value, label);
  if (resolved <= 0) {
    throw new TypeError(`${label} must be greater than zero.`);
  }
  return resolved;
}

export function assertWorkspaceDetachmentProviderCallbacks(
  getInitialWindowBounds: unknown,
  onWindowChange: unknown,
  renderWindowHead: unknown,
  validateDetachment: unknown,
): void {
  const callbacks = [
    [getInitialWindowBounds, "getInitialWindowBounds"],
    [onWindowChange, "onWindowChange"],
    [renderWindowHead, "renderWindowHead"],
    [validateDetachment, "validateDetachment"],
  ] as const;
  for (const [callback, name] of callbacks) {
    if (callback !== undefined && typeof callback !== "function") {
      throw new TypeError(`WorkspaceDetachmentProvider ${name} must be a function.`);
    }
  }
}

export function resolveWorkspaceDetachmentDecision(value: unknown): WorkspaceDetachmentDecision {
  const record = optionOverridesAt(
    value,
    decisionKeys,
    "Workspace detachment decision",
    "workspace detachment decision field",
  );
  if (record.allowed === true) {
    if (Object.hasOwn(record, "reason")) {
      throw new TypeError("An allowed workspace detachment decision cannot include a reason.");
    }
    return Object.freeze({ allowed: true });
  }
  if (record.allowed !== false) {
    throw new TypeError("Workspace detachment decision allowed must be boolean.");
  }
  if (typeof record.reason !== "string" || record.reason.trim().length === 0) {
    throw new TypeError("A rejected workspace detachment decision requires a reason.");
  }
  return Object.freeze({ allowed: false, reason: record.reason.trim() });
}

export function resolveWorkspaceDetachedWindowInitialBounds(
  value: unknown,
): WorkspaceDetachedWindowInitialBounds {
  if (value === undefined || value === null) {
    return defaultInitialBounds;
  }
  const record = optionOverridesAt(
    value,
    initialBoundsKeys,
    "Workspace detached-window initial bounds",
    "workspace detached-window bounds field",
  );
  return Object.freeze({
    height:
      record.height === undefined
        ? defaultInitialBounds.height
        : positiveNumber(record.height, "Workspace detached-window height"),
    width:
      record.width === undefined
        ? defaultInitialBounds.width
        : positiveNumber(record.width, "Workspace detached-window width"),
    ...(record.x === undefined ? {} : { x: finiteNumber(record.x, "Workspace detached-window x") }),
    ...(record.y === undefined ? {} : { y: finiteNumber(record.y, "Workspace detached-window y") }),
  });
}

export function workspaceDetachedWindowFeatures(
  bounds: WorkspaceDetachedWindowInitialBounds,
): string {
  const features = [
    "popup=yes",
    `width=${String(Math.round(bounds.width ?? defaultInitialBounds.width))}`,
    `height=${String(Math.round(bounds.height ?? defaultInitialBounds.height))}`,
  ];
  if (bounds.x !== undefined) {
    features.push(`left=${String(Math.round(bounds.x))}`);
  }
  if (bounds.y !== undefined) {
    features.push(`top=${String(Math.round(bounds.y))}`);
  }
  return features.join(",");
}

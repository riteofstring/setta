import type { Action } from "@json-render/core";
import type { ReactNode } from "react";

export type RawElementProps = {
  key?: unknown;
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
};

export type AppComponentProps = {
  element: RawElementProps & { props?: Record<string, unknown> };
  children?: ReactNode;
  onAction?: (action: Action) => void;
};

export function resolveConfigId(
  bindingConfigId: string | null,
  runtimeConfigId: string | null,
  scopeConfigId: string | null,
) {
  return bindingConfigId ?? scopeConfigId ?? runtimeConfigId ?? null;
}

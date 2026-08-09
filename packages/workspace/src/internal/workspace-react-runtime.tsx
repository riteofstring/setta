import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import type { WorkspaceAppearance, WorkspaceController } from "../core.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import type { ResolvedWorkspaceAppearanceOptions } from "./workspace-preferences.js";
import type { WorkspaceBooleanPreferenceChangeHandler } from "./workspace-react-contract.js";

export function useWorkspaceBooleanPreference(
  label: string,
  value: boolean,
  onChange: WorkspaceBooleanPreferenceChangeHandler | undefined,
): readonly [boolean, WorkspaceBooleanPreferenceChangeHandler] {
  if (onChange !== undefined && typeof onChange !== "function") {
    throw new TypeError(`${label} change handler must be a function.`);
  }
  const controlled = onChange !== undefined;
  const initialControlledRef = useRef(controlled);
  if (initialControlledRef.current !== controlled) {
    throw new TypeError(`${label} cannot switch between controlled and uncontrolled usage.`);
  }
  const [uncontrolledValue, setUncontrolledValue] = useState(value);
  const resolvedValue = controlled ? value : uncontrolledValue;
  useEffect(() => {
    if (!controlled) {
      setUncontrolledValue(value);
    }
  }, [controlled, value]);
  const setValue = useCallback(
    (nextValue: boolean) => {
      if (onChange) {
        onChange(nextValue);
      } else {
        setUncontrolledValue(nextValue);
      }
    },
    [onChange],
  );
  return [resolvedValue, setValue];
}

const DARK_APPEARANCE_QUERY = "(prefers-color-scheme: dark)";
export type ResolvedWorkspaceAppearance = Exclude<WorkspaceAppearance, "system">;
const lightAppearanceSnapshot = (): ResolvedWorkspaceAppearance => "light";
const emptyAppearanceSubscription = () => () => undefined;

function currentSystemAppearance(): ResolvedWorkspaceAppearance {
  return window.matchMedia(DARK_APPEARANCE_QUERY).matches ? "dark" : "light";
}

function subscribeToSystemAppearance(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_APPEARANCE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useResolvedWorkspaceAppearance(
  appearance: WorkspaceAppearance,
): ResolvedWorkspaceAppearance {
  const followsSystem = appearance === "system";
  const systemAppearance = useSyncExternalStore(
    followsSystem ? subscribeToSystemAppearance : emptyAppearanceSubscription,
    followsSystem ? currentSystemAppearance : lightAppearanceSnapshot,
    lightAppearanceSnapshot,
  );
  return appearance === "system" ? systemAppearance : appearance;
}

export function workspaceThemeStyle(
  options: ResolvedWorkspaceAppearanceOptions,
  appearance: ResolvedWorkspaceAppearance,
): CSSProperties {
  const tokens = options[appearance];
  return {
    "--setta-workspace-canvas-background": tokens.canvasBackground,
    "--setta-workspace-connection": tokens.connection,
    "--setta-workspace-control-background": tokens.controlBackground,
    "--setta-workspace-focus": tokens.focus,
    "--setta-workspace-grid-color": tokens.gridColor,
    "--setta-workspace-group-background": tokens.groupBackground,
    "--setta-workspace-invalid": tokens.invalid,
    "--setta-workspace-minimap-background": tokens.minimapBackground,
    "--setta-workspace-section-background": tokens.sectionBackground,
    "--setta-workspace-section-border": tokens.sectionBorder,
    "--setta-workspace-section-header-background": tokens.sectionHeaderBackground,
    "--setta-workspace-section-muted-text": tokens.sectionMutedText,
    "--setta-workspace-section-text": tokens.sectionText,
    "--setta-workspace-selection": tokens.selection,
    "--setta-workspace-toolbar-background": tokens.toolbarBackground,
    colorScheme: appearance,
  } as CSSProperties;
}

export async function focusCreatedWorkspaceSection<TSectionData>(
  controller: WorkspaceController<TSectionData>,
  canvasController: WorkspaceCanvasController,
  sectionId: string,
  panIntoView: boolean,
): Promise<void> {
  const focused = await canvasController.focusElementWhenReady(sectionId);
  if (focused && panIntoView) {
    await controller.focusSection(sectionId);
  }
}

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { type WorkspaceHost, useWorkspaceHost } from "@setta/workspace";

import type {
  DrawingAlignment,
  DrawingDistribution,
  DrawingSelectionKind,
  DrawingSelectionSnapshot,
  DrawingSelectionValue,
  DrawingTextAlign,
} from "./drawingRuntime";
import {
  alignDrawingSelection,
  bringDrawingSelectionForward,
  bringDrawingSelectionToFront,
  deleteDrawingSelection,
  distributeDrawingSelection,
  duplicateDrawingSelection,
  getDrawingSurfaceSnapshot,
  groupDrawingSelection,
  sendDrawingSelectionBackward,
  sendDrawingSelectionToBack,
  setDrawingSelectionAppearance,
  setDrawingSelectionTypography,
  subscribeDrawingSurface,
  toggleDrawingSelectionLock,
  ungroupDrawingSelection,
  type DrawingSurfaceSnapshot,
} from "./drawingSurfaceRegistry";

type DrawingSelectionInspectorProps = {
  sectionId: string;
};

type MixedCheckboxProps = {
  accessibleLabel: string;
  label: string;
  onChange: (checked: boolean) => void;
  value: DrawingSelectionValue<boolean>;
};

type PaintControlProps = {
  color: DrawingSelectionValue<string>;
  enabled: DrawingSelectionValue<boolean>;
  fallbackColor: string;
  label: "Fill" | "Stroke";
  onColorChange: (color: string) => void;
  onEnabledChange: (enabled: boolean) => void;
};

type NumberControlProps = {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: DrawingSelectionValue<number>;
};

const DRAWING_SELECTION_KIND_LABELS: Record<DrawingSelectionKind, string> = {
  arrow: "Arrow",
  ellipse: "Ellipse",
  group: "Group",
  image: "Image",
  line: "Line",
  mixed: "Mixed",
  none: "None",
  object: "Object",
  rectangle: "Rectangle",
  stroke: "Stroke",
  text: "Text",
};

const SYSTEM_FONT_OPTIONS = [
  { label: "System UI", value: "system-ui" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
] as const;

const ALIGNMENT_ACTIONS: ReadonlyArray<{
  label: string;
  shortLabel: string;
  value: DrawingAlignment;
}> = [
  { label: "Align left", shortLabel: "Left", value: "left" },
  {
    label: "Align horizontal centers",
    shortLabel: "Center X",
    value: "horizontal-center",
  },
  { label: "Align right", shortLabel: "Right", value: "right" },
  { label: "Align top", shortLabel: "Top", value: "top" },
  {
    label: "Align vertical centers",
    shortLabel: "Center Y",
    value: "vertical-center",
  },
  { label: "Align bottom", shortLabel: "Bottom", value: "bottom" },
];

const DISTRIBUTION_ACTIONS: ReadonlyArray<{
  label: string;
  shortLabel: string;
  value: DrawingDistribution;
}> = [
  {
    label: "Distribute horizontally",
    shortLabel: "Horizontal",
    value: "horizontal",
  },
  {
    label: "Distribute vertically",
    shortLabel: "Vertical",
    value: "vertical",
  },
];

const TEXT_ALIGNMENT_ACTIONS: ReadonlyArray<{
  label: string;
  shortLabel: string;
  value: DrawingTextAlign;
}> = [
  { label: "Align text left", shortLabel: "Left", value: "left" },
  { label: "Center text", shortLabel: "Center", value: "center" },
  { label: "Align text right", shortLabel: "Right", value: "right" },
  { label: "Justify text", shortLabel: "Justify", value: "justify" },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function concreteValue<Value>(
  value: DrawingSelectionValue<Value>,
): Value | null {
  return value === null || value === "mixed" ? null : value;
}

function fieldLabel(
  label: string,
  value: DrawingSelectionValue<unknown>,
): string {
  return value === "mixed" ? `${label} (Mixed)` : label;
}

function colorInputValue(
  value: DrawingSelectionValue<string>,
  fallback: string,
): string {
  const concrete = concreteValue(value);
  return concrete !== null && HEX_COLOR.test(concrete) ? concrete : fallback;
}

function MixedCheckbox({
  accessibleLabel,
  label,
  onChange,
  value,
}: MixedCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.indeterminate = value === "mixed";
    }
  }, [value]);
  return (
    <label className="realtime-drawing-inspector-checkbox realtime-drawing-selection-toggle">
      <input
        aria-checked={value === "mixed" ? "mixed" : value === true}
        aria-label={accessibleLabel}
        checked={value === true}
        onChange={(event) => onChange(event.currentTarget.checked)}
        ref={inputRef}
        type="checkbox"
      />
      <span>{fieldLabel(label, value)}</span>
    </label>
  );
}

function PaintControl({
  color,
  enabled,
  fallbackColor,
  label,
  onColorChange,
  onEnabledChange,
}: PaintControlProps) {
  const concreteColor = concreteValue(color);
  return (
    <div
      className={`realtime-drawing-selection-paint realtime-drawing-selection-${label.toLowerCase()}`}
    >
      <MixedCheckbox
        accessibleLabel={`${label} enabled`}
        label={`${label} enabled`}
        onChange={onEnabledChange}
        value={enabled}
      />
      <label className="realtime-drawing-inspector-field realtime-drawing-selection-color">
        <span>{fieldLabel(`${label} color`, color)}</span>
        <div className="realtime-drawing-selection-color-value">
          <input
            aria-label={`${label} color`}
            className="setta-workspace-native-color setta-workspace-inspector-style-picker"
            disabled={enabled === false}
            onChange={(event) => onColorChange(event.currentTarget.value)}
            type="color"
            value={colorInputValue(color, fallbackColor)}
          />
          <output>
            {concreteColor ?? (color === "mixed" ? "Mixed" : "None")}
          </output>
        </div>
      </label>
    </div>
  );
}

function NumberControl({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: NumberControlProps) {
  const concrete = concreteValue(value);
  return (
    <label className="realtime-drawing-inspector-field realtime-drawing-selection-number">
      <span>{fieldLabel(label, value)}</span>
      <input
        aria-label={label}
        className="setta-workspace-inspector-input"
        max={max}
        min={min}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (
            Number.isFinite(next) &&
            next >= min &&
            (max === undefined || next <= max)
          ) {
            onChange(next);
          }
        }}
        placeholder={value === "mixed" ? "Mixed" : undefined}
        step={step}
        type="number"
        value={concrete ?? ""}
      />
    </label>
  );
}

function SelectionPanelHeading({ status }: { status: string }) {
  return (
    <div className="realtime-drawing-inspector-heading realtime-drawing-selection-heading">
      <h4>Selection</h4>
      <span>{status}</span>
    </div>
  );
}

type DrawingSelectedInspectorProps = {
  host: WorkspaceHost;
  sectionId: string;
  selection: DrawingSelectionSnapshot;
};

function paintValue(enabled: boolean, color: string): string | null {
  return enabled ? color : null;
}

function percentageLabel(value: DrawingSelectionValue<number>): string {
  if (value === "mixed") {
    return "Mixed";
  }
  return `${Math.round((value ?? 1) * 100)}%`;
}

function pressedState<Value>(
  value: DrawingSelectionValue<Value>,
  pressedValue: Value,
): boolean | "mixed" {
  return value === "mixed" ? "mixed" : value === pressedValue;
}

function mixedAccessibleLabel(
  label: string,
  value: DrawingSelectionValue<unknown>,
): string {
  return value === "mixed" ? `${label}, mixed` : label;
}

function toggledValue<Value>(
  value: DrawingSelectionValue<Value>,
  active: Value,
  inactive: Value,
): Value {
  return value === active ? inactive : active;
}

function customFontOption(fontFamily: string | null): string | null {
  if (fontFamily === null) {
    return null;
  }
  return SYSTEM_FONT_OPTIONS.some((option) => option.value === fontFamily)
    ? null
    : fontFamily;
}

function DrawingAppearanceControls({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  const fillColor = concreteValue(selection.fillColor) ?? "#2563eb";
  const strokeColor = concreteValue(selection.strokeColor) ?? "#111827";
  return (
    <div className="realtime-drawing-selection-property-group realtime-drawing-selection-appearance">
      <h5>Appearance</h5>
      {selection.supportsFill ? (
        <PaintControl
          color={selection.fillColor}
          enabled={selection.fillEnabled}
          fallbackColor="#2563eb"
          label="Fill"
          onColorChange={(color) =>
            void setDrawingSelectionAppearance(host, sectionId, { fill: color })
          }
          onEnabledChange={(enabled) =>
            void setDrawingSelectionAppearance(host, sectionId, {
              fill: paintValue(enabled, fillColor),
            })
          }
        />
      ) : null}
      {selection.supportsStroke ? (
        <>
          <PaintControl
            color={selection.strokeColor}
            enabled={selection.strokeEnabled}
            fallbackColor="#111827"
            label="Stroke"
            onColorChange={(color) =>
              void setDrawingSelectionAppearance(host, sectionId, {
                stroke: color,
              })
            }
            onEnabledChange={(enabled) =>
              void setDrawingSelectionAppearance(host, sectionId, {
                stroke: paintValue(enabled, strokeColor),
              })
            }
          />
          <NumberControl
            label="Stroke width"
            min={0}
            onChange={(strokeWidth) =>
              void setDrawingSelectionAppearance(host, sectionId, {
                strokeWidth,
              })
            }
            step={0.5}
            value={selection.strokeWidth}
          />
        </>
      ) : null}
      <label className="realtime-drawing-inspector-field realtime-drawing-selection-opacity">
        <span>{fieldLabel("Opacity", selection.opacity)}</span>
        <div className="setta-workspace-inspector-config-range">
          <input
            aria-label="Opacity"
            className="setta-workspace-inspector-config-input"
            max={100}
            min={0}
            onChange={(event) =>
              void setDrawingSelectionAppearance(host, sectionId, {
                opacity: Number(event.currentTarget.value) / 100,
              })
            }
            step={1}
            type="range"
            value={Math.round((concreteValue(selection.opacity) ?? 1) * 100)}
          />
          <output>{percentageLabel(selection.opacity)}</output>
        </div>
      </label>
      {selection.supportsCornerRadius ? (
        <NumberControl
          label="Corner radius"
          min={0}
          onChange={(cornerRadius) =>
            void setDrawingSelectionAppearance(host, sectionId, {
              cornerRadius,
            })
          }
          step={1}
          value={selection.cornerRadius}
        />
      ) : null}
    </div>
  );
}

function DrawingFontFamilyControl({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  const fontFamily = concreteValue(selection.fontFamily);
  const customFont = customFontOption(fontFamily);
  return (
    <label className="realtime-drawing-inspector-field realtime-drawing-selection-font-family">
      <span>{fieldLabel("Font family", selection.fontFamily)}</span>
      <select
        aria-label="Font family"
        className="setta-workspace-inspector-input"
        onChange={(event) => {
          if (event.currentTarget.value !== "") {
            void setDrawingSelectionTypography(host, sectionId, {
              fontFamily: event.currentTarget.value,
            });
          }
        }}
        value={fontFamily ?? ""}
      >
        {fontFamily === null ? (
          <option disabled value="">
            Mixed
          </option>
        ) : null}
        {customFont === null ? null : (
          <option value={customFont}>{customFont}</option>
        )}
        {SYSTEM_FONT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DrawingTextEmphasisControls({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  return (
    <div
      aria-label="Text emphasis"
      className="setta-workspace-inspector-toggle-grid realtime-drawing-selection-emphasis"
      role="group"
    >
      <button
        aria-label={mixedAccessibleLabel("Bold", selection.fontWeight)}
        aria-pressed={pressedState(selection.fontWeight, "bold")}
        className="setta-workspace-inspector-toggle"
        onClick={() =>
          void setDrawingSelectionTypography(host, sectionId, {
            fontWeight: toggledValue(selection.fontWeight, "bold", "normal"),
          })
        }
        type="button"
      >
        Bold
      </button>
      <button
        aria-label={mixedAccessibleLabel("Italic", selection.fontStyle)}
        aria-pressed={pressedState(selection.fontStyle, "italic")}
        className="setta-workspace-inspector-toggle"
        onClick={() =>
          void setDrawingSelectionTypography(host, sectionId, {
            fontStyle: toggledValue(selection.fontStyle, "italic", "normal"),
          })
        }
        type="button"
      >
        Italic
      </button>
    </div>
  );
}

function DrawingTextAlignmentControls({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  return (
    <div
      aria-label="Text alignment"
      className="setta-workspace-inspector-toggle-grid realtime-drawing-selection-text-alignment"
      role="group"
    >
      {TEXT_ALIGNMENT_ACTIONS.map((action) => (
        <button
          aria-label={action.label}
          aria-pressed={selection.textAlign === action.value}
          className="setta-workspace-inspector-toggle"
          key={action.value}
          onClick={() =>
            void setDrawingSelectionTypography(host, sectionId, {
              textAlign: action.value,
            })
          }
          type="button"
        >
          {action.shortLabel}
        </button>
      ))}
      {selection.textAlign === "mixed" ? (
        <span className="realtime-drawing-selection-mixed-value">Mixed</span>
      ) : null}
    </div>
  );
}

function DrawingTypographyControls(props: DrawingSelectedInspectorProps) {
  const { host, sectionId, selection } = props;
  return (
    <div className="realtime-drawing-selection-property-group realtime-drawing-selection-typography">
      <h5>Text</h5>
      <DrawingFontFamilyControl {...props} />
      <NumberControl
        label="Font size"
        min={1}
        onChange={(fontSize) =>
          void setDrawingSelectionTypography(host, sectionId, { fontSize })
        }
        step={1}
        value={selection.fontSize}
      />
      <DrawingTextEmphasisControls {...props} />
      <DrawingTextAlignmentControls {...props} />
    </div>
  );
}

function DrawingArrangeActions({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  return (
    <div className="realtime-drawing-selection-command-group">
      <h5>Arrange</h5>
      <div className="setta-workspace-inspector-actions realtime-drawing-selection-layer-actions">
        <button
          disabled={!selection.canMoveForward}
          onClick={() => void bringDrawingSelectionForward(host, sectionId)}
          type="button"
        >
          Bring forward
        </button>
        <button
          disabled={!selection.canMoveForward}
          onClick={() => void bringDrawingSelectionToFront(host, sectionId)}
          type="button"
        >
          Bring to front
        </button>
        <button
          disabled={!selection.canMoveBackward}
          onClick={() => void sendDrawingSelectionBackward(host, sectionId)}
          type="button"
        >
          Send backward
        </button>
        <button
          disabled={!selection.canMoveBackward}
          onClick={() => void sendDrawingSelectionToBack(host, sectionId)}
          type="button"
        >
          Send to back
        </button>
      </div>
    </div>
  );
}

function DrawingAlignmentActions({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  return (
    <div className="realtime-drawing-selection-command-group">
      <h5>Align</h5>
      <div className="setta-workspace-inspector-actions realtime-drawing-selection-align-actions">
        {ALIGNMENT_ACTIONS.map((action) => (
          <button
            aria-label={action.label}
            disabled={!selection.canAlign}
            key={action.value}
            onClick={() =>
              void alignDrawingSelection(host, sectionId, action.value)
            }
            type="button"
          >
            {action.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function DrawingDistributionActions({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  return (
    <div className="realtime-drawing-selection-command-group">
      <h5>Distribute</h5>
      <div className="setta-workspace-inspector-actions realtime-drawing-selection-distribute-actions">
        {DISTRIBUTION_ACTIONS.map((action) => (
          <button
            aria-label={action.label}
            disabled={!selection.canDistribute}
            key={action.value}
            onClick={() =>
              void distributeDrawingSelection(host, sectionId, action.value)
            }
            type="button"
          >
            {action.shortLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function DrawingObjectActions({
  host,
  sectionId,
  selection,
}: DrawingSelectedInspectorProps) {
  const lockLabel = selection.locked === true ? "Unlock" : "Lock";
  return (
    <div className="setta-workspace-inspector-actions realtime-drawing-selection-object-actions">
      <button
        disabled={!selection.canDuplicate}
        onClick={() => void duplicateDrawingSelection(host, sectionId)}
        type="button"
      >
        Duplicate
      </button>
      <button
        disabled={!selection.canGroup}
        onClick={() => void groupDrawingSelection(host, sectionId)}
        type="button"
      >
        Group
      </button>
      <button
        disabled={!selection.canUngroup}
        onClick={() => void ungroupDrawingSelection(host, sectionId)}
        type="button"
      >
        Ungroup
      </button>
      <button
        disabled={!selection.canLock}
        onClick={() => void toggleDrawingSelectionLock(host, sectionId)}
        type="button"
      >
        {lockLabel}
      </button>
      <button
        className="setta-workspace-inspector-danger-action realtime-drawing-selection-delete"
        disabled={!selection.canDelete}
        onClick={() => void deleteDrawingSelection(host, sectionId)}
        type="button"
      >
        Delete
      </button>
    </div>
  );
}

function DrawingSelectedInspector(props: DrawingSelectedInspectorProps) {
  const { selection } = props;
  return (
    <section
      aria-label="Drawing selection"
      className="realtime-drawing-selection-inspector"
      data-state="selected"
    >
      <SelectionPanelHeading
        status={`${selection.count} selected · ${DRAWING_SELECTION_KIND_LABELS[selection.kind]}`}
      />
      <div className="realtime-drawing-selection-properties">
        <DrawingAppearanceControls {...props} />
        {selection.supportsTypography ? (
          <DrawingTypographyControls {...props} />
        ) : null}
      </div>
      <DrawingArrangeActions {...props} />
      <DrawingAlignmentActions {...props} />
      <DrawingDistributionActions {...props} />
      <DrawingObjectActions {...props} />
    </section>
  );
}

function DrawingSelectionState({
  instruction,
  state,
  status,
}: {
  instruction: string;
  state: "empty" | "unavailable";
  status: string;
}) {
  return (
    <section
      aria-label="Drawing selection"
      className="realtime-drawing-selection-inspector"
      data-state={state}
    >
      <SelectionPanelHeading status={status} />
      <p>{instruction}</p>
    </section>
  );
}

export function DrawingSelectionInspector({
  sectionId,
}: DrawingSelectionInspectorProps) {
  const host = useWorkspaceHost();
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeDrawingSurface(host, sectionId, listener),
    [host, sectionId],
  );
  const getSnapshot = useCallback(
    (): DrawingSurfaceSnapshot => getDrawingSurfaceSnapshot(host, sectionId),
    [host, sectionId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!snapshot.available) {
    return (
      <DrawingSelectionState
        instruction="Expand the section to edit drawing objects."
        state="unavailable"
        status="Unavailable"
      />
    );
  }
  if (snapshot.selection.count === 0) {
    return (
      <DrawingSelectionState
        instruction="Select an object on the canvas to edit it."
        state="empty"
        status="None"
      />
    );
  }
  return (
    <DrawingSelectedInspector
      host={host}
      sectionId={sectionId}
      selection={snapshot.selection}
    />
  );
}

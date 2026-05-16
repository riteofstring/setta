import type {
  GpuRetainedContentDateCalendarDescriptor,
  GpuRetainedContentDateCalendarDrawCommand,
  GpuRetainedContentDateTimeMode,
} from "./retainedContentDateCalendarTypes";
import type { GpuRetainedContentHitRecord } from "./retainedContentHitTypes";
import type { GpuRetainedContentRowStatus } from "./retainedContentRowStatus";
import type { GpuRetainedContentScrollbarDrawCommand } from "./retainedContentScrollbar";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentRowState = {
  readonly controlFocused: boolean;
  readonly disabled: boolean;
  readonly dragging: boolean;
  readonly error: boolean;
  readonly focused: boolean;
  readonly hovered: boolean;
  readonly nativeControlActive: boolean;
  readonly nativeLabelActive: boolean;
  readonly searchFocused: boolean;
  readonly searchMatched: boolean;
  readonly selected: boolean;
};

export type GpuRetainedContentLabelAppearance = {
  readonly fontFamily: "mono" | "sans";
  readonly fontWeight: "normal" | "semibold";
  readonly tone: "accent" | "default" | "muted";
};

export type GpuRetainedContentRowVisualBounds = {
  readonly width: number;
  readonly x: number;
};

type GpuRetainedContentRowPortInput = {
  readonly id: string;
  readonly kind: "input" | "output";
  readonly side: "left" | "right";
};

type GpuRetainedContentControlCommitPolicy =
  | "immediate"
  | "native-island"
  | "preview-commit";

export type GpuRetainedContentTextLikeEditorPolicy = {
  readonly editorKind: "code" | "text" | "textarea";
  readonly language: string | null;
  readonly linePolicy: "multiline-auto" | "multiline-fixed" | "single-line";
  readonly maxVisibleLines: number;
  readonly minVisibleLines: number;
  readonly wrapLines: boolean;
};

export type GpuRetainedContentColorChoice = {
  readonly color: string;
  readonly description: string;
};

export type GpuRetainedContentDropdownChoice = {
  readonly label: string;
  readonly value: string;
};

export type GpuRetainedContentDropzoneAttachment = {
  readonly id: string | null;
  readonly kind: "file" | "text";
  readonly name: string;
  readonly sizeLabel: string | null;
};

export type GpuRetainedContentPopupChoice =
  | GpuRetainedContentColorChoice
  | GpuRetainedContentDropdownChoice;

export type GpuRetainedContentControlDescriptor =
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly editorKind: "code" | "text" | "textarea";
      readonly kind: "text-like";
      readonly policy: GpuRetainedContentTextLikeEditorPolicy;
      readonly rendererFamily: string;
      readonly commitPolicy: "native-island";
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "button";
      readonly label: string;
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate";
    }
  | {
      readonly checked: boolean;
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "switch";
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate";
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "slider";
      readonly rendererFamily: string;
      readonly commitPolicy: "preview-commit";
      readonly max: number;
      readonly min: number;
      readonly step: number;
      readonly value: number;
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "rotary";
      readonly rendererFamily: string;
      readonly commitPolicy: "preview-commit";
      readonly max: number;
      readonly min: number;
      readonly step: number;
      readonly value: number;
    }
  | {
      readonly choices: readonly GpuRetainedContentColorChoice[];
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "color-picker";
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate" | "native-island";
      readonly selectedIndex: number | null;
    }
  | {
      readonly choices: readonly GpuRetainedContentDropdownChoice[];
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "dropdown";
      readonly rendererFamily: string;
      readonly commitPolicy: "immediate";
      readonly selectedIndex: number | null;
    }
  | {
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly hasSecret: boolean;
      readonly kind: "password";
      readonly placeholder: string;
      readonly rendererFamily: string;
      readonly revealAvailable: boolean;
      readonly revealPending: boolean;
      readonly revealedValue: string | null;
      readonly commitPolicy: "native-island";
    }
  | {
      readonly attachments: readonly GpuRetainedContentDropzoneAttachment[];
      readonly canAttachMore: boolean;
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "dropzone";
      readonly label: string;
      readonly maxAttachments: number | null;
      readonly mode: string;
      readonly placeholder: string;
      readonly remainingSlots: number | null;
      readonly rendererFamily: string;
      readonly commitPolicy: "native-island";
    }
  | {
      readonly calendar: GpuRetainedContentDateCalendarDescriptor | null;
      readonly defaultDisplayValue: string;
      readonly displayValue: string;
      readonly kind: "date-time";
      readonly label: string;
      readonly mode: GpuRetainedContentDateTimeMode;
      readonly rendererFamily: string;
      readonly summaryText: string | null;
      readonly commitPolicy: GpuRetainedContentControlCommitPolicy;
    };

export type GpuRetainedContentRowInput = {
  readonly control?: GpuRetainedContentControlDescriptor | null | undefined;
  readonly controlKind: string | null;
  readonly depth: number;
  readonly height?: number | undefined;
  readonly id: string;
  readonly label: string;
  readonly labelAppearance?:
    | GpuRetainedContentLabelAppearance
    | null
    | undefined;
  readonly ports?: readonly GpuRetainedContentRowPortInput[] | undefined;
  readonly state?: Partial<GpuRetainedContentRowState> | undefined;
  readonly status?: GpuRetainedContentRowStatus | null | undefined;
  readonly verticalGapBefore?: number | undefined;
};

export type GpuRetainedContentRow = {
  readonly contentRect: GpuRect;
  readonly control: GpuRetainedContentControlDescriptor | null;
  readonly controlKind: string | null;
  readonly depth: number;
  readonly id: string;
  readonly index: number;
  readonly label: string;
  readonly labelAppearance: GpuRetainedContentLabelAppearance;
  readonly ports: readonly GpuRetainedContentRowPortInput[];
  readonly projectedRect: GpuRect;
  readonly state: GpuRetainedContentRowState;
  readonly status: GpuRetainedContentRowStatus | null;
  readonly visualContentRect: GpuRect;
  readonly visualProjectedRect: GpuRect;
};

export type GpuRetainedContentVisibleRowRange = {
  readonly endIndex: number;
  readonly rowCount: number;
  readonly startIndex: number;
};

export type GpuRetainedContentRowMetric = {
  readonly height: number;
  readonly index: number;
  readonly input: GpuRetainedContentRowInput;
  readonly y: number;
};

export type GpuRetainedContentActivePopupInput = {
  readonly highlightedDateIso?: string | null | undefined;
  readonly highlightedOptionIndex?: number | null | undefined;
  readonly kind: "color-picker" | "date-calendar" | "dropdown";
  readonly ownerRowId: string;
};

export type GpuRetainedContentDropMarkerEdge = "after" | "before" | "inside";

export type GpuRetainedContentDrawCommand =
  | {
      readonly dividerRects: readonly GpuRect[];
      readonly kind: "row-background";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly state: GpuRetainedContentRowState;
    }
  | {
      readonly depth: number;
      readonly kind: "row-label";
      readonly appearance: GpuRetainedContentLabelAppearance;
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly text: string;
    }
  | {
      readonly kind: "row-status-badge";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly status: GpuRetainedContentRowStatus;
    }
  | {
      readonly kind: "row-status-overlay";
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly status: GpuRetainedContentRowStatus;
    }
  | {
      readonly control: GpuRetainedContentControlDescriptor;
      readonly controlKind: string;
      readonly kind: "row-control";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly depth: number;
      readonly kind: "nest-guide";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly edge: GpuRetainedContentDropMarkerEdge;
      readonly kind: "row-drop-marker";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly kind: "row-drag-preview";
      readonly rect: GpuRect;
      readonly rowCount: number;
      readonly rowId: string;
      readonly text: string;
    }
  | {
      readonly kind: "control-popup-background";
      readonly rect: GpuRect;
      readonly rowId: string;
    }
  | {
      readonly kind: "control-popup-option";
      readonly highlighted: boolean;
      readonly option: GpuRetainedContentPopupChoice;
      readonly optionIndex: number;
      readonly rect: GpuRect;
      readonly rowId: string;
      readonly selected: boolean;
    }
  | GpuRetainedContentScrollbarDrawCommand
  | GpuRetainedContentDateCalendarDrawCommand;

export type GpuRetainedContentPortAnchor = {
  readonly hitRect: GpuRect;
  readonly id: string;
  readonly kind: "input" | "output";
  readonly localPosition: GpuPoint;
  readonly ownerRowId: string;
  readonly side: "left" | "right";
};

export type GpuRetainedContentScene = {
  readonly contentRect: GpuRect;
  readonly drawCommands: readonly GpuRetainedContentDrawCommand[];
  readonly hitRecords: readonly GpuRetainedContentHitRecord[];
  readonly id: string;
  readonly ownerSectionId: string;
  readonly portAnchors: readonly GpuRetainedContentPortAnchor[];
  readonly rowHeight: number;
  readonly rowOrder: readonly string[];
  readonly rows: readonly GpuRetainedContentRow[];
  readonly scrollOffset: GpuPoint;
  readonly visibleRange: GpuRetainedContentVisibleRowRange;
  readonly viewportRect: GpuRect;
};

export type GpuRetainedContentDragPreviewInput = {
  readonly draggingRowIds: readonly string[];
  readonly dropMarker?:
    | {
        readonly edge: GpuRetainedContentDropMarkerEdge;
        readonly rowId: string;
      }
    | null
    | undefined;
  readonly pointerLocal?: GpuPoint | null | undefined;
};

export type CreateGpuRetainedRowContentSceneInput = {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRightInset?: number | undefined;
  readonly controlWidth?: number | undefined;
  readonly dragPreview?: GpuRetainedContentDragPreviewInput | null | undefined;
  readonly id: string;
  readonly indentWidth?: number | undefined;
  readonly labelControlGap?: number | undefined;
  readonly ownerSectionId: string;
  readonly overscanRows?: number | undefined;
  readonly portHitSize?: number | undefined;
  readonly rowVisualBounds?:
    | GpuRetainedContentRowVisualBounds
    | null
    | undefined;
  readonly rowHeight: number;
  readonly rows: readonly GpuRetainedContentRowInput[];
  readonly scrollOffset: GpuPoint;
  readonly viewportRect: GpuRect;
};

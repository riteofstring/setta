import type {
  GpuRetainedContentActivePopupInput,
  GpuRetainedContentDragPreviewInput,
  GpuRetainedContentRowInput,
  GpuRetainedContentRowMetric,
  GpuRetainedContentRowVisualBounds,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const retainedContentSceneSourceInputKey: unique symbol = Symbol(
  "gpu-retained-content-scene-source-input",
);

type GpuRetainedContentSceneSourceBaseInput = {
  readonly activePopup?: GpuRetainedContentActivePopupInput | null | undefined;
  readonly controlRightInset: number;
  readonly controlWidth: number;
  readonly dragPreview?: GpuRetainedContentDragPreviewInput | null | undefined;
  readonly id: string;
  readonly indentWidth: number;
  readonly labelControlGap: number;
  readonly overscanRows: number;
  readonly ownerSectionId: string;
  readonly portHitSize: number;
  readonly rowHeight: number;
  readonly rowVisualBounds: GpuRetainedContentRowVisualBounds;
  readonly rows: readonly GpuRetainedContentRowInput[];
  readonly viewportRect: GpuRect;
};

type GpuRetainedContentSceneSourceLayout = {
  readonly contentRect: GpuRect;
  readonly hasVerticalGaps: boolean;
  readonly rowMetrics: readonly GpuRetainedContentRowMetric[];
  readonly rowOrder: readonly string[];
};

export type GpuRetainedContentSceneSourceInput =
  GpuRetainedContentSceneSourceBaseInput & {
    readonly layout: GpuRetainedContentSceneSourceLayout;
  };

type GpuRetainedContentSceneWithSourceInput = GpuRetainedContentScene & {
  readonly [retainedContentSceneSourceInputKey]?:
    | GpuRetainedContentSceneSourceInput
    | undefined;
};

const retainedContentSceneSourceInputs = new WeakMap<
  GpuRetainedContentScene,
  GpuRetainedContentSceneSourceInput
>();

export function setGpuRetainedContentSceneSourceInput(
  scene: GpuRetainedContentScene,
  sourceInput: GpuRetainedContentSceneSourceInput,
) {
  retainedContentSceneSourceInputs.set(scene, sourceInput);
  Object.defineProperty(scene, retainedContentSceneSourceInputKey, {
    configurable: true,
    enumerable: true,
    value: sourceInput,
  });
}

export function getGpuRetainedContentSceneSourceInput(
  scene: GpuRetainedContentScene,
): GpuRetainedContentSceneSourceInput | undefined {
  return (
    retainedContentSceneSourceInputs.get(scene) ??
    (scene as GpuRetainedContentSceneWithSourceInput)[
      retainedContentSceneSourceInputKey
    ]
  );
}

import type {
  CreateGpuRetainedRowContentSceneInput,
  GpuRetainedContentScene,
} from "./retainedContentScene";

const retainedContentSceneSourceInputKey: unique symbol = Symbol(
  "gpu-retained-content-scene-source-input",
);

export type GpuRetainedContentSceneSourceInput = Required<
  Pick<
    CreateGpuRetainedRowContentSceneInput,
    | "controlRightInset"
    | "controlWidth"
    | "indentWidth"
    | "labelControlGap"
    | "overscanRows"
    | "portHitSize"
  >
> &
  Pick<
    CreateGpuRetainedRowContentSceneInput,
    | "activePopup"
    | "dragPreview"
    | "id"
    | "ownerSectionId"
    | "rowHeight"
    | "rows"
    | "viewportRect"
  >;

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

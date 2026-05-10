import type {
  HtmlSurfaceRenderCommand,
  HtmlSurfaceRenderDisplayList,
  HtmlSurfaceRenderPipelineKind,
} from "./displayList";
import type { HtmlSurfaceEffectPass } from "./rendererEffect";
import type { HtmlSurfaceFlatPass } from "./rendererFlat";
import type { HtmlSurfaceMeshPass } from "./rendererMesh";
import type { HtmlSurfaceSolidRoundedRectPass } from "./rendererSolidRoundedRect";
import {
  HtmlSurfaceTiledFlatPass,
  createTiledFlatSurfaceDrawTiles,
  type TiledFlatSurfaceDrawTile,
} from "./rendererTiledFlat";
import type {
  HtmlSurfaceEffectVisual,
  HtmlSurfaceFlatVisual,
  HtmlSurfaceMeshVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./visualScene";

export type HtmlSurfaceDisplayDrawEntry =
  | {
      readonly command: HtmlSurfaceRenderCommand;
      readonly flatIndex: number;
      readonly pipelineKind: "flat";
    }
  | {
      readonly command: HtmlSurfaceRenderCommand;
      readonly pipelineKind: "tiled-flat";
      readonly tileCount: number;
      readonly tileStart: number;
    }
  | {
      readonly command: HtmlSurfaceRenderCommand;
      readonly meshIndex: number;
      readonly pipelineKind: "mesh";
    }
  | {
      readonly command: HtmlSurfaceRenderCommand;
      readonly effectIndex: number;
      readonly pipelineKind: "effect";
    }
  | {
      readonly command: HtmlSurfaceRenderCommand;
      readonly pipelineKind: "solid-rounded-rect";
      readonly solidRoundedRectIndex: number;
    };

export type HtmlSurfaceDisplayDrawBatch = {
  readonly entryCount: number;
  readonly firstEntryIndex: number;
  readonly pipelineKind: HtmlSurfaceRenderPipelineKind;
};

export type HtmlSurfaceDisplayDrawPlan = {
  readonly batches: readonly HtmlSurfaceDisplayDrawBatch[];
  readonly drawEntries: readonly HtmlSurfaceDisplayDrawEntry[];
  readonly effectSurfaces: readonly HtmlSurfaceEffectVisual[];
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly meshSurfaces: readonly HtmlSurfaceMeshVisual[];
  readonly solidRoundedRectSurfaces: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly tiledFlatSurfaceTiles: readonly TiledFlatSurfaceDrawTile[];
};

export type PreparedMeshSurfaceDraw = {
  readonly draw: ReturnType<HtmlSurfaceMeshPass["prepare"]>;
  readonly pass: HtmlSurfaceMeshPass;
};

export type PreparedEffectSurfaceDraw = {
  readonly draw: ReturnType<HtmlSurfaceEffectPass["prepare"]>;
  readonly pass: HtmlSurfaceEffectPass;
};

export type PreparedFlatSurfaceDraw = ReturnType<
  HtmlSurfaceFlatPass["prepare"]
>;

export type PreparedSolidRoundedRectSurfaceDraw = ReturnType<
  HtmlSurfaceSolidRoundedRectPass["prepare"]
>;

export type PreparedDisplayListDrawResources = {
  readonly effectSurfaceDraw: PreparedEffectSurfaceDraw | null;
  readonly flatSurfaceDraw: PreparedFlatSurfaceDraw;
  readonly meshSurfaceDraw: PreparedMeshSurfaceDraw | null;
  readonly solidRoundedRectSurfaceDraw: PreparedSolidRoundedRectSurfaceDraw;
  readonly tiledFlatSurfaceDraw: PreparedFlatSurfaceDraw;
};

export function drawHtmlSurfaceDisplayPlan({
  cameraBindGroup,
  displayDrawPlan,
  flatSurfacePass,
  getTiledFlatSurfacePass,
  pass,
  resources,
  solidRoundedRectSurfacePass,
}: {
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly flatSurfacePass: HtmlSurfaceFlatPass | null;
  readonly getTiledFlatSurfacePass: () => HtmlSurfaceTiledFlatPass;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
  readonly solidRoundedRectSurfacePass: HtmlSurfaceSolidRoundedRectPass | null;
}) {
  for (const batch of displayDrawPlan.batches) {
    drawDisplayBatch({
      batch,
      cameraBindGroup,
      displayDrawPlan,
      flatSurfacePass,
      getTiledFlatSurfacePass,
      pass,
      resources,
      solidRoundedRectSurfacePass,
    });
  }
}

export function createHtmlSurfaceDisplayDrawPlan(
  displayList: HtmlSurfaceRenderDisplayList,
): HtmlSurfaceDisplayDrawPlan {
  const drawEntries: HtmlSurfaceDisplayDrawEntry[] = [];
  const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
  const tiledFlatSurfaceTiles: TiledFlatSurfaceDrawTile[] = [];
  const meshSurfaces: HtmlSurfaceMeshVisual[] = [];
  const effectSurfaces: HtmlSurfaceEffectVisual[] = [];
  const solidRoundedRectSurfaces: HtmlSurfaceSolidRoundedRectVisual[] = [];

  for (const command of displayList.commands) {
    switch (command.kind) {
      case "flat": {
        const flatIndex = flatSurfaces.length;
        flatSurfaces.push(command.visual);
        drawEntries.push({ command, flatIndex, pipelineKind: "flat" });
        break;
      }
      case "tiled-flat": {
        const tileStart = tiledFlatSurfaceTiles.length;
        const tiles = createTiledFlatSurfaceDrawTiles([command.visual]);
        tiledFlatSurfaceTiles.push(...tiles);
        if (tiles.length > 0) {
          drawEntries.push({
            command,
            pipelineKind: "tiled-flat",
            tileCount: tiles.length,
            tileStart,
          });
        }
        break;
      }
      case "mesh": {
        const meshIndex = meshSurfaces.length;
        meshSurfaces.push(command.visual);
        drawEntries.push({ command, meshIndex, pipelineKind: "mesh" });
        break;
      }
      case "effect": {
        const effectIndex = effectSurfaces.length;
        effectSurfaces.push(command.visual);
        drawEntries.push({ command, effectIndex, pipelineKind: "effect" });
        break;
      }
      case "solid-rounded-rect": {
        const solidRoundedRectIndex = solidRoundedRectSurfaces.length;
        solidRoundedRectSurfaces.push(command.visual);
        drawEntries.push({
          command,
          pipelineKind: "solid-rounded-rect",
          solidRoundedRectIndex,
        });
        break;
      }
    }
  }

  return {
    batches: createHtmlSurfaceDisplayDrawBatches(drawEntries),
    drawEntries,
    effectSurfaces,
    flatSurfaces,
    meshSurfaces,
    solidRoundedRectSurfaces,
    tiledFlatSurfaceTiles,
  };
}

export function sumTiledBatchTileCount(
  displayDrawPlan: HtmlSurfaceDisplayDrawPlan,
  batch: HtmlSurfaceDisplayDrawBatch,
): number {
  let tileCount = 0;
  for (
    let index = batch.firstEntryIndex;
    index < batch.firstEntryIndex + batch.entryCount;
    index += 1
  ) {
    const entry = displayDrawPlan.drawEntries[index];
    if (entry?.pipelineKind === "tiled-flat") {
      tileCount += entry.tileCount;
    }
  }
  return tileCount;
}

function createHtmlSurfaceDisplayDrawBatches(
  drawEntries: readonly HtmlSurfaceDisplayDrawEntry[],
): readonly HtmlSurfaceDisplayDrawBatch[] {
  const batches: HtmlSurfaceDisplayDrawBatch[] = [];
  for (let index = 0; index < drawEntries.length; index += 1) {
    const entry = drawEntries[index];
    if (!entry) {
      continue;
    }
    const previous = batches.at(-1);
    if (previous?.pipelineKind === entry.pipelineKind) {
      batches[batches.length - 1] = {
        ...previous,
        entryCount: previous.entryCount + 1,
      };
      continue;
    }
    batches.push({
      entryCount: 1,
      firstEntryIndex: index,
      pipelineKind: entry.pipelineKind,
    });
  }
  return batches;
}

function drawDisplayBatch({
  batch,
  cameraBindGroup,
  displayDrawPlan,
  flatSurfacePass,
  getTiledFlatSurfacePass,
  pass,
  resources,
  solidRoundedRectSurfacePass,
}: {
  readonly batch: HtmlSurfaceDisplayDrawBatch;
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly flatSurfacePass: HtmlSurfaceFlatPass | null;
  readonly getTiledFlatSurfacePass: () => HtmlSurfaceTiledFlatPass;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
  readonly solidRoundedRectSurfacePass: HtmlSurfaceSolidRoundedRectPass | null;
}) {
  switch (batch.pipelineKind) {
    case "flat":
      drawFlatDisplayBatch({
        batch,
        cameraBindGroup,
        displayDrawPlan,
        flatSurfacePass,
        pass,
        resources,
      });
      break;
    case "tiled-flat":
      drawTiledFlatDisplayBatch({
        batch,
        cameraBindGroup,
        displayDrawPlan,
        getTiledFlatSurfacePass,
        pass,
        resources,
      });
      break;
    case "mesh":
      drawMeshDisplayBatch({
        batch,
        cameraBindGroup,
        displayDrawPlan,
        pass,
        resources,
      });
      break;
    case "effect":
      drawEffectDisplayBatch({
        batch,
        cameraBindGroup,
        displayDrawPlan,
        pass,
        resources,
      });
      break;
    case "solid-rounded-rect":
      drawSolidRoundedRectDisplayBatch({
        batch,
        cameraBindGroup,
        displayDrawPlan,
        pass,
        resources,
        solidRoundedRectSurfacePass,
      });
      break;
  }
}

function drawFlatDisplayBatch({
  batch,
  cameraBindGroup,
  displayDrawPlan,
  flatSurfacePass,
  pass,
  resources,
}: {
  readonly batch: HtmlSurfaceDisplayDrawBatch;
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly flatSurfacePass: HtmlSurfaceFlatPass | null;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
}) {
  const firstEntry = displayDrawPlan.drawEntries[batch.firstEntryIndex];
  if (firstEntry?.pipelineKind !== "flat") {
    return;
  }
  flatSurfacePass?.drawRange({
    cameraBindGroup,
    count: batch.entryCount,
    flatSurfaceDraw: resources.flatSurfaceDraw,
    flatSurfaces: displayDrawPlan.flatSurfaces,
    pass,
    start: firstEntry.flatIndex,
  });
}

function drawTiledFlatDisplayBatch({
  batch,
  cameraBindGroup,
  displayDrawPlan,
  getTiledFlatSurfacePass,
  pass,
  resources,
}: {
  readonly batch: HtmlSurfaceDisplayDrawBatch;
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly getTiledFlatSurfacePass: () => HtmlSurfaceTiledFlatPass;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
}) {
  const firstEntry = displayDrawPlan.drawEntries[batch.firstEntryIndex];
  if (firstEntry?.pipelineKind !== "tiled-flat") {
    return;
  }
  getTiledFlatSurfacePass().drawRange({
    cameraBindGroup,
    count: sumTiledBatchTileCount(displayDrawPlan, batch),
    pass,
    start: firstEntry.tileStart,
    tiledFlatSurfaceDraw: resources.tiledFlatSurfaceDraw,
    tiledFlatSurfaceTiles: displayDrawPlan.tiledFlatSurfaceTiles,
  });
}

function drawMeshDisplayBatch({
  batch,
  cameraBindGroup,
  displayDrawPlan,
  pass,
  resources,
}: {
  readonly batch: HtmlSurfaceDisplayDrawBatch;
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
}) {
  const firstEntry = displayDrawPlan.drawEntries[batch.firstEntryIndex];
  const meshSurfaceDraw = resources.meshSurfaceDraw;
  if (firstEntry?.pipelineKind !== "mesh" || !meshSurfaceDraw) {
    return;
  }
  meshSurfaceDraw.pass.drawRange({
    cameraBindGroup,
    count: batch.entryCount,
    meshSurfaceDraw: meshSurfaceDraw.draw,
    meshSurfaces: displayDrawPlan.meshSurfaces,
    pass,
    start: firstEntry.meshIndex,
  });
}

function drawEffectDisplayBatch({
  batch,
  cameraBindGroup,
  displayDrawPlan,
  pass,
  resources,
}: {
  readonly batch: HtmlSurfaceDisplayDrawBatch;
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
}) {
  const firstEntry = displayDrawPlan.drawEntries[batch.firstEntryIndex];
  const effectSurfaceDraw = resources.effectSurfaceDraw;
  if (firstEntry?.pipelineKind !== "effect" || !effectSurfaceDraw) {
    return;
  }
  effectSurfaceDraw.pass.drawRange({
    cameraBindGroup,
    count: batch.entryCount,
    effectSurfaceDraw: effectSurfaceDraw.draw,
    effectSurfaces: displayDrawPlan.effectSurfaces,
    pass,
    start: firstEntry.effectIndex,
  });
}

function drawSolidRoundedRectDisplayBatch({
  batch,
  cameraBindGroup,
  displayDrawPlan,
  pass,
  resources,
  solidRoundedRectSurfacePass,
}: {
  readonly batch: HtmlSurfaceDisplayDrawBatch;
  readonly cameraBindGroup: GPUBindGroup;
  readonly displayDrawPlan: HtmlSurfaceDisplayDrawPlan;
  readonly pass: GPURenderPassEncoder;
  readonly resources: PreparedDisplayListDrawResources;
  readonly solidRoundedRectSurfacePass: HtmlSurfaceSolidRoundedRectPass | null;
}) {
  const firstEntry = displayDrawPlan.drawEntries[batch.firstEntryIndex];
  if (firstEntry?.pipelineKind !== "solid-rounded-rect") {
    return;
  }
  solidRoundedRectSurfacePass?.drawRange({
    cameraBindGroup,
    count: batch.entryCount,
    pass,
    solidRoundedRectSurfaceDraw: resources.solidRoundedRectSurfaceDraw,
    start: firstEntry.solidRoundedRectIndex,
  });
}

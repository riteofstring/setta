import {
  ArtifactTypeEnum,
  DrawAreaBrushShapeEnum,
  DrawAreaModeEnum,
  createBrushStroke,
  createBrushStrokeArtifact,
  createDrawAreaLayer,
  createDrawAreaLayerItem,
  createDrawAreaLayerItemTransform,
  createDrawAreaLayerItemTransformArtifact,
  type UpdateArtifactMsgContent,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated artifact support", () => {
  it("exports canonical artifact and draw-area enums", () => {
    expect(ArtifactTypeEnum.Image).toBe("Image");
    expect(ArtifactTypeEnum.BrushStroke).toBe("BrushStroke");
    expect(DrawAreaBrushShapeEnum.round).toBe("round");
    expect(DrawAreaModeEnum.draw).toBe("draw");
  });

  it("creates draw-area helpers with stable defaults", () => {
    const stroke = createBrushStroke({
      points: [[10, 20]],
    });
    const strokeArtifact = createBrushStrokeArtifact({
      value: stroke,
    });
    const transform = createDrawAreaLayerItemTransform();
    const transformArtifact = createDrawAreaLayerItemTransformArtifact({
      value: transform,
    });
    const layerItem = createDrawAreaLayerItem({
      dataPath: strokeArtifact.id,
      transformId: transformArtifact.id,
    });
    const layer = createDrawAreaLayer({
      elements: [layerItem],
    });

    expect(stroke.lineCap).toBe(DrawAreaBrushShapeEnum.round);
    expect(stroke.globalCompositeOperation).toBe("source-over");
    expect(strokeArtifact.type).toBe(ArtifactTypeEnum.BrushStroke);
    expect(strokeArtifact.id.startsWith("artifacts/")).toBe(true);
    expect(transform.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(transformArtifact.type).toBe(
      ArtifactTypeEnum.DrawAreaLayerItemTransform,
    );
    expect(layerItem.type).toBe(ArtifactTypeEnum.BrushStroke);
    expect(layer.visible).toBe(true);
    expect(layer.layerOpacity).toBe(1);
    expect(layer.name.length).toBeGreaterThan(0);
  });

  it("types artifact update envelopes as discriminated unions", () => {
    const update: UpdateArtifactMsgContent = {
      updateType: "update",
      artifacts: [
        createBrushStrokeArtifact({
          value: createBrushStroke({
            points: [
              [0, 0],
              [1, 1],
            ],
          }),
        }),
      ],
    };

    expect(update.artifacts[0]?.type).toBe(ArtifactTypeEnum.BrushStroke);
  });
});

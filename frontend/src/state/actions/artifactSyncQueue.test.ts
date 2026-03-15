import { addTemporaryNotification } from "state/actions/notifications";
import {
  useBrushStrokes,
  useDrawAreaLayerItemTransform,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import { route_update_artifacts } from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  DrawAreaBrushShapeEnum,
  SettaNotificationTypeEnum,
  createBrushStroke,
  createBrushStrokeArtifact,
  createDrawAreaLayerItemTransform,
  createDrawAreaLayerItemTransformArtifact,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetArtifactSyncQueueForTests,
  flushQueuedArtifacts,
  queueBrushStrokeForSave,
  queueTransformsForSave,
} from "./artifactSyncQueue";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await vi.importActual<
    typeof import("utils/generatedEndpoints")
  >("utils/generatedEndpoints");
  return {
    ...actual,
    route_update_artifacts: vi.fn(),
  };
});

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: vi.fn(),
}));

const mockedRouteUpdateArtifacts = vi.mocked(route_update_artifacts);
const mockedAddTemporaryNotification = vi.mocked(addTemporaryNotification);

describe("artifactSyncQueue", () => {
  beforeEach(() => {
    resetProjectStores();
    __resetArtifactSyncQueueForTests();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    __resetArtifactSyncQueueForTests();
    resetProjectStores();
  });

  it("debounces queued draw artifact saves and sends each synced artifact once", async () => {
    // Repeated saves before the debounce window should collapse into a single artifact update request.
    vi.useFakeTimers();
    const stroke = createBrushStrokeArtifact({
      id: "stroke-1",
      value: createBrushStroke({
        strokeStyle: "#fff",
        lineWidth: 2,
        lineCap: DrawAreaBrushShapeEnum.round,
        points: [
          [0, 0],
          [10, 10],
        ],
      }),
    });
    const transform = createDrawAreaLayerItemTransformArtifact({
      id: "transform-1",
      value: createDrawAreaLayerItemTransform({
        transform: [1, 0, 0, 1, 32, 12],
      }),
    });
    useBrushStrokes.setState({
      x: { [stroke.id]: stroke },
      revisionById: {},
      localRevisionById: {},
    });
    useDrawAreaLayerItemTransform.setState({
      x: { [transform.id]: transform },
      revisionById: {},
      localRevisionById: {},
    });
    mockedRouteUpdateArtifacts.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [],
    });

    queueBrushStrokeForSave(stroke.id, { transformId: transform.id });
    queueTransformsForSave([transform.id]);
    await vi.advanceTimersByTimeAsync(1500);

    expect(mockedRouteUpdateArtifacts).toHaveBeenCalledTimes(1);
    expect(mockedRouteUpdateArtifacts).toHaveBeenCalledWith({
      artifacts: [stroke, transform],
      conflictStrategy: null,
      uploadScope: "generic",
    });
  });

  it("flushes queued transform saves immediately and surfaces conflict warnings", async () => {
    // Forced flushes should reuse the pending queue, clear it on success, and warn on skipped/conflicted writes.
    const transform = createDrawAreaLayerItemTransformArtifact({
      id: "transform-1",
      value: createDrawAreaLayerItemTransform({
        transform: [1, 0, 0, 1, 48, 24],
      }),
    });
    useDrawAreaLayerItemTransform.setState({
      x: { [transform.id]: transform },
      revisionById: {},
      localRevisionById: {},
    });
    mockedRouteUpdateArtifacts.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: [
        {
          id: transform.id,
          type: ArtifactTypeEnum.DrawAreaLayerItemTransform,
          status: "conflict",
          backupPath: null,
          message: "Transform conflict detected.",
        },
      ],
    });

    queueTransformsForSave([transform.id]);
    await flushQueuedArtifacts();
    await flushQueuedArtifacts();

    expect(mockedRouteUpdateArtifacts).toHaveBeenCalledTimes(1);
    expect(mockedAddTemporaryNotification).toHaveBeenCalledWith(
      "Transform conflict detected.",
      SettaNotificationTypeEnum.warning,
    );
  });
});

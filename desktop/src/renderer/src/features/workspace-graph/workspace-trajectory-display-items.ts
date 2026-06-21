import type {
  WorkspaceTrajectorySprite,
  WorkspaceTrajectorySpriteSeverity,
  WorkspaceTrajectorySpriteStatus,
} from "@generated/backend";
import { normalizeTrajectoryDisplayText } from "./workspace-trajectory-display-labels";

type WorkspaceTrajectoryDisplayLane = "recent" | "workflow_node";
type WorkspaceTrajectoryDisplayAggregateKind = "cartographer_status" | "memory_suggestion";
type WorkspaceTrajectoryDisplaySurface = "canvas" | "details";

export type WorkspaceTrajectoryDisplayItem =
  | {
      anchorNodeId: string;
      id: string;
      lane: WorkspaceTrajectoryDisplayLane;
      sprite: WorkspaceTrajectorySprite;
      type: "sprite";
    }
  | {
      aggregate: WorkspaceTrajectoryDisplayAggregate;
      anchorNodeId: string;
      id: string;
      lane: WorkspaceTrajectoryDisplayLane;
      type: "aggregate";
    };

interface WorkspaceTrajectoryDisplayAggregate {
  anchorNodeId: string;
  count: number;
  hiddenSourcePreviewCount: number;
  id: string;
  kind: WorkspaceTrajectoryDisplayAggregateKind;
  label: string;
  lane: WorkspaceTrajectoryDisplayLane;
  severity: WorkspaceTrajectorySpriteSeverity;
  sourcePreviews: WorkspaceTrajectoryDisplayAggregateSourcePreview[];
  sourceSpriteIds: string[];
  status: WorkspaceTrajectorySpriteStatus;
  updatedAt: string;
}

interface WorkspaceTrajectoryDisplayAggregateSourcePreview {
  id: string;
  label: string;
  status: WorkspaceTrajectorySpriteStatus;
  summary: string;
  updatedAt: string;
}

interface CartographerAggregateBucket {
  anchorNodeId: string;
  kind: WorkspaceTrajectoryDisplayAggregateKind;
  lane: WorkspaceTrajectoryDisplayLane;
  sprites: WorkspaceTrajectorySprite[];
  status: WorkspaceTrajectorySpriteStatus;
}

interface DisplayProjection {
  cartographerBuckets: Map<string, CartographerAggregateBucket>;
  directItems: WorkspaceTrajectoryDisplayItem[];
}

const agentTrajectoryKinds = new Set<string>([
  "approval",
  "assistant_message",
  "command",
  "diff",
  "file_read",
  "file_write",
  "plan_update",
  "reasoning_summary",
  "test",
  "tool_call",
]);

const cartographerAggregateStateLabels = {
  approval_required: "review required",
  cancelled: "cancelled",
  completed: "completed",
  failed: "failed",
  pending: "queued",
  running: "running",
  unknown: "updated",
} satisfies Record<WorkspaceTrajectorySpriteStatus, string>;

const aggregateStatusPriorities = {
  approval_required: 600,
  cancelled: 100,
  completed: 100,
  failed: 600,
  pending: 0,
  running: 300,
  unknown: 100,
} satisfies Record<WorkspaceTrajectorySpriteStatus, number>;

const maxAggregateSourcePreviews = 4;
const maxAggregateSourceSummaryLength = 180;

export function displayItemsForCanvas(
  items: WorkspaceTrajectoryDisplayItem[],
): WorkspaceTrajectoryDisplayItem[] {
  return displayItemsForSurface(items, "canvas");
}

export function displayItemsForDetails(
  items: WorkspaceTrajectoryDisplayItem[],
): WorkspaceTrajectoryDisplayItem[] {
  return displayItemsForSurface(items, "details");
}

export function sortDisplayItems(
  items: WorkspaceTrajectoryDisplayItem[],
): WorkspaceTrajectoryDisplayItem[] {
  return items.sort(
    (left, right) =>
      displayItemPriority(right) - displayItemPriority(left) ||
      severityRank(displayItemSeverity(right)) - severityRank(displayItemSeverity(left)) ||
      stringTimestamp(displayItemUpdatedAt(right)) - stringTimestamp(displayItemUpdatedAt(left)) ||
      left.id.localeCompare(right.id),
  );
}

export function displayItemSeverity(
  item: WorkspaceTrajectoryDisplayItem,
): WorkspaceTrajectorySpriteSeverity {
  return item.type === "aggregate" ? item.aggregate.severity : item.sprite.severity;
}

export function displayItemSourceSpriteIds(item: WorkspaceTrajectoryDisplayItem): string[] {
  return item.type === "aggregate" ? item.aggregate.sourceSpriteIds : [item.sprite.id];
}

export function newestDisplayItemUpdatedAt(items: WorkspaceTrajectoryDisplayItem[]) {
  return (
    items
      .map(displayItemUpdatedAt)
      .sort((left, right) => stringTimestamp(right) - stringTimestamp(left))[0] ?? ""
  );
}

function displayItemsForSurface(
  items: WorkspaceTrajectoryDisplayItem[],
  surface: WorkspaceTrajectoryDisplaySurface,
) {
  const projection: DisplayProjection = {
    cartographerBuckets: new Map(),
    directItems: [],
  };
  for (const item of items) {
    addProjectedDisplayItem(projection, item, surface);
  }
  return sortDisplayItems([
    ...projection.directItems,
    ...aggregateItemsForProjection(projection, surface),
  ]);
}

function addProjectedDisplayItem(
  projection: DisplayProjection,
  item: WorkspaceTrajectoryDisplayItem,
  surface: WorkspaceTrajectoryDisplaySurface,
) {
  if (item.type === "aggregate") {
    projection.directItems.push(item);
    return;
  }
  const aggregateKind = cartographerAggregateKind(item.sprite);
  if (aggregateKind === null) {
    projection.directItems.push(item);
    return;
  }
  if (surface === "canvas" && aggregateKind === "memory_suggestion") {
    return;
  }
  appendCartographerBucket(projection.cartographerBuckets, item, aggregateKind);
}

function appendCartographerBucket(
  buckets: Map<string, CartographerAggregateBucket>,
  item: Extract<WorkspaceTrajectoryDisplayItem, { type: "sprite" }>,
  kind: WorkspaceTrajectoryDisplayAggregateKind,
) {
  const key = cartographerAggregateKey({
    anchorNodeId: item.anchorNodeId,
    kind,
    lane: item.lane,
    status: item.sprite.status,
  });
  const bucket = buckets.get(key) ?? {
    anchorNodeId: item.anchorNodeId,
    kind,
    lane: item.lane,
    sprites: [],
    status: item.sprite.status,
  };
  bucket.sprites.push(item.sprite);
  buckets.set(key, bucket);
}

function aggregateItemsForProjection(
  projection: DisplayProjection,
  surface: WorkspaceTrajectoryDisplaySurface,
) {
  return [...projection.cartographerBuckets.values()].flatMap((bucket) => {
    const aggregate = displayAggregateFromBucket(bucket);
    if (surface === "canvas" && !aggregateShouldRenderOnCanvas(aggregate)) {
      return [];
    }
    return [
      {
        aggregate,
        anchorNodeId: aggregate.anchorNodeId,
        id: aggregate.id,
        lane: aggregate.lane,
        type: "aggregate" as const,
      },
    ];
  });
}

function cartographerAggregateKind(
  sprite: WorkspaceTrajectorySprite,
): WorkspaceTrajectoryDisplayAggregateKind | null {
  if (sprite.kind !== "cartographer_status") {
    return null;
  }
  if (sprite.cartographerPatchId !== "" && sprite.status === "approval_required") {
    return "memory_suggestion";
  }
  return cartographerLifecycleSpriteHasTypedId(sprite) ? "cartographer_status" : null;
}

function cartographerLifecycleSpriteHasTypedId(sprite: WorkspaceTrajectorySprite) {
  return (
    sprite.cartographerRunId !== "" ||
    sprite.cartographerWindowId !== "" ||
    sprite.cartographerPatchId !== ""
  );
}

function displayAggregateFromBucket(
  bucket: CartographerAggregateBucket,
): WorkspaceTrajectoryDisplayAggregate {
  const sprites = newestSprites([...bucket.sprites]);
  const sourcePreviews = sprites
    .slice(0, maxAggregateSourcePreviews)
    .map((sprite) => aggregateSourcePreview(bucket.kind, sprite));
  const aggregateId = cartographerAggregateKey(bucket);
  return {
    anchorNodeId: bucket.anchorNodeId,
    count: sprites.length,
    hiddenSourcePreviewCount: Math.max(0, sprites.length - sourcePreviews.length),
    id: aggregateId,
    kind: bucket.kind,
    label: cartographerAggregateLabel(bucket.kind, bucket.status, sprites.length),
    lane: bucket.lane,
    severity: highestSeverity(sprites.map((sprite) => sprite.severity)),
    sourcePreviews,
    sourceSpriteIds: sprites.map((sprite) => sprite.id),
    status: bucket.status,
    updatedAt: newestSpriteUpdatedAt(sprites),
  };
}

function cartographerAggregateKey({
  anchorNodeId,
  kind,
  lane,
  status,
}: {
  anchorNodeId: string;
  kind: WorkspaceTrajectoryDisplayAggregateKind;
  lane: WorkspaceTrajectoryDisplayLane;
  status: WorkspaceTrajectorySpriteStatus;
}) {
  return ["trajectory-aggregate", lane, anchorNodeId || "global", kind, status].join(":");
}

function aggregateShouldRenderOnCanvas(aggregate: WorkspaceTrajectoryDisplayAggregate) {
  return (
    aggregate.kind !== "memory_suggestion" &&
    !(aggregate.status === "pending" && aggregate.count === 1)
  );
}

function cartographerAggregateLabel(
  kind: WorkspaceTrajectoryDisplayAggregateKind,
  status: WorkspaceTrajectorySpriteStatus,
  count: number,
) {
  if (kind === "memory_suggestion") {
    return count === 1 ? "Memory suggestion" : `${count} memory suggestions`;
  }
  const state = cartographerAggregateStateLabels[status];
  return count === 1 ? `Cartographer ${state}` : `${count} cartographers ${state}`;
}

function newestSprites(sprites: WorkspaceTrajectorySprite[]) {
  return sprites.sort(
    (left, right) =>
      stringTimestamp(right.updatedAt || right.createdAt) -
        stringTimestamp(left.updatedAt || left.createdAt) ||
      spriteStatusRank(right) - spriteStatusRank(left) ||
      severityRank(right.severity) - severityRank(left.severity) ||
      left.id.localeCompare(right.id),
  );
}

function aggregateSourcePreview(
  kind: WorkspaceTrajectoryDisplayAggregateKind,
  sprite: WorkspaceTrajectorySprite,
): WorkspaceTrajectoryDisplayAggregateSourcePreview {
  return {
    id: sprite.id,
    label: aggregateSourcePreviewLabel(kind, sprite),
    status: sprite.status,
    summary: aggregateSourcePreviewSummary(kind, sprite),
    updatedAt: sprite.updatedAt || sprite.createdAt,
  };
}

function aggregateSourcePreviewLabel(
  kind: WorkspaceTrajectoryDisplayAggregateKind,
  sprite: WorkspaceTrajectorySprite,
) {
  if (kind === "memory_suggestion") {
    return "Memory suggestion";
  }
  if (sprite.cartographerWindowId !== "") {
    return "Cartographer window";
  }
  if (sprite.cartographerRunId !== "") {
    return "Cartographer run";
  }
  return "Cartographer update";
}

function aggregateSourcePreviewSummary(
  kind: WorkspaceTrajectoryDisplayAggregateKind,
  sprite: WorkspaceTrajectorySprite,
) {
  if (kind === "memory_suggestion") {
    return firstNonEmpty(
      boundedSourceSummary(memorySuggestionSummaryText(sprite.resultSummary)),
      "Review this suggested memory update.",
    );
  }
  return firstNonEmpty(
    boundedSourceSummary(sprite.resultSummary),
    boundedSourceSummary(sprite.errorSummary),
    boundedSourceSummary(sprite.subtitle),
    boundedSourceSummary(sprite.title),
    `Cartographer ${cartographerAggregateStateLabels[sprite.status]}`,
  );
}

function memorySuggestionSummaryText(value: string) {
  const summary = boundedSourceSummary(value);
  if (summary === "" || containsInternalMemorySuggestionTerm(summary)) {
    return "";
  }
  return summary;
}

function containsInternalMemorySuggestionTerm(value: string) {
  const lower = value.toLowerCase();
  return (
    lower.includes("cartographer_patch") ||
    lower.includes("pending_review") ||
    lower.includes("semantic patch")
  );
}

function boundedSourceSummary(value: string) {
  const normalized = normalizeTrajectoryDisplayText(value);
  return normalized.length <= maxAggregateSourceSummaryLength
    ? normalized
    : `${normalized.slice(0, maxAggregateSourceSummaryLength - 3)}...`;
}

function firstNonEmpty(...values: string[]): string {
  return values.find((value) => value !== "") ?? "";
}

function displayItemPriority(item: WorkspaceTrajectoryDisplayItem) {
  if (item.type === "aggregate") {
    return displayAggregatePriority(item.aggregate);
  }
  if (itemIsBlockingOrFailure(item.sprite.status, item.sprite.severity)) {
    return 600;
  }
  if (agentTrajectoryKinds.has(item.sprite.kind) && spriteHasActiveStatus(item.sprite.status)) {
    return 500;
  }
  if (agentTrajectoryKinds.has(item.sprite.kind)) {
    return 400;
  }
  if (item.sprite.kind === "workflow_status" && spriteHasActiveStatus(item.sprite.status)) {
    return 500;
  }
  if (item.sprite.kind === "workflow_status") {
    return 350;
  }
  return spriteStatusRank(item.sprite);
}

function displayAggregatePriority(aggregate: WorkspaceTrajectoryDisplayAggregate) {
  if (aggregate.kind === "memory_suggestion") {
    return 350;
  }
  if (itemIsBlockingOrFailure(aggregate.status, aggregate.severity)) {
    return 600;
  }
  if (aggregate.status === "pending") {
    return aggregate.count > 1 ? 200 : 150;
  }
  return aggregateStatusPriorities[aggregate.status];
}

function itemIsBlockingOrFailure(
  status: WorkspaceTrajectorySpriteStatus,
  severity: WorkspaceTrajectorySpriteSeverity,
) {
  return (
    status === "approval_required" ||
    status === "failed" ||
    severity === "blocking" ||
    severity === "error"
  );
}

function spriteHasActiveStatus(status: WorkspaceTrajectorySpriteStatus) {
  return status === "running" || status === "pending";
}

function displayItemUpdatedAt(item: WorkspaceTrajectoryDisplayItem) {
  if (item.type === "aggregate") {
    return item.aggregate.updatedAt;
  }
  return item.sprite.updatedAt || item.sprite.createdAt;
}

function newestSpriteUpdatedAt(sprites: WorkspaceTrajectorySprite[]) {
  return (
    sprites
      .map((sprite) => sprite.updatedAt || sprite.createdAt)
      .sort((left, right) => stringTimestamp(right) - stringTimestamp(left))[0] ?? ""
  );
}

function spriteStatusRank(sprite: WorkspaceTrajectorySprite) {
  switch (sprite.status) {
    case "approval_required":
      return 600;
    case "failed":
      return 500;
    case "running":
      return 400;
    case "pending":
      return 300;
    case "cancelled":
      return 200;
    case "completed":
      return 100;
    case "unknown":
      return 0;
    default:
      return assertNever(sprite.status);
  }
}

function highestSeverity(severities: WorkspaceTrajectorySpriteSeverity[]) {
  return severities.sort((left, right) => severityRank(right) - severityRank(left))[0] ?? "info";
}

function severityRank(severity: WorkspaceTrajectorySpriteSeverity) {
  switch (severity) {
    case "blocking":
      return 500;
    case "error":
      return 400;
    case "warning":
      return 300;
    case "success":
      return 200;
    case "info":
      return 100;
    default:
      return assertNever(severity);
  }
}

function stringTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace trajectory display value: ${String(value)}`);
}

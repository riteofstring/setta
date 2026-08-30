export const DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP = 48;

export type WorkspaceTopLevelAutoLayoutOptions = Readonly<{
  gap?: number;
}>;

export type WorkspaceTopLevelAutoLayoutRectangle = Readonly<{
  height: number;
  id: string;
  locked: boolean;
  width: number;
  x: number;
  y: number;
  zIndex: number;
}>;

export type WorkspaceTopLevelAutoLayoutPlan = Readonly<{
  positionsById: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
}>;

type MovableRectangle = WorkspaceTopLevelAutoLayoutRectangle &
  Readonly<{
    paddedHeight: number;
    paddedWidth: number;
  }>;

type PackedPlacement = Readonly<{
  rectangle: MovableRectangle;
  x: number;
  y: number;
}>;

type PackedCandidate = Readonly<{
  height: number;
  placements: ReadonlyArray<PackedPlacement>;
  shelves: ReadonlyArray<Readonly<{ height: number; usedWidth: number }>>;
  width: number;
}>;

type EvaluatedCandidate = Readonly<{
  origin: Readonly<{ x: number; y: number }>;
  placements: ReadonlyArray<PackedPlacement>;
  score: Readonly<[number, number, number, number, number]>;
  shelfWidth: number;
}>;

const LANDSCAPE_ASPECT_RATIO = 4 / 3;
const SHELF_WIDTH_FACTORS = Object.freeze([
  0.65,
  0.8,
  1,
  Math.sqrt(LANDSCAPE_ASPECT_RATIO),
  1.35,
  1.6,
  2,
]);

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertPositiveFinite(
  value: unknown,
  label: string,
): asserts value is number {
  assertFinite(value, label);
  if (value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function finite(value: number, label: string): number {
  assertFinite(value, label);
  return value;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateRectangles(
  rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
): Array<WorkspaceTopLevelAutoLayoutRectangle> {
  if (!Array.isArray(rectangles)) {
    throw new Error("Auto-layout rectangles must be an array.");
  }
  const ids = new Set<string>();
  return rectangles.map((rectangle, index) => {
    if (
      rectangle === null ||
      typeof rectangle !== "object" ||
      Array.isArray(rectangle)
    ) {
      throw new Error(`Rectangle ${index} must be an object.`);
    }
    const candidate = rectangle as Record<string, unknown>;
    for (const field of [
      "id",
      "x",
      "y",
      "width",
      "height",
      "zIndex",
      "locked",
    ]) {
      if (!Object.hasOwn(candidate, field)) {
        throw new Error(`Rectangle ${index} is missing ${field}.`);
      }
    }
    const { height, id, locked, width, x, y, zIndex } = candidate;
    if (typeof id !== "string") {
      throw new Error(`Rectangle ${index} id must be a string.`);
    }
    if (ids.has(id)) {
      throw new Error(
        `Auto-layout rectangles cannot contain duplicate id ${id}.`,
      );
    }
    ids.add(id);
    assertFinite(x, `Rectangle ${id} x`);
    assertFinite(y, `Rectangle ${id} y`);
    assertPositiveFinite(width, `Rectangle ${id} width`);
    assertPositiveFinite(height, `Rectangle ${id} height`);
    assertFinite(zIndex, `Rectangle ${id} zIndex`);
    if (typeof locked !== "boolean") {
      throw new Error(`Rectangle ${id} locked must be a boolean.`);
    }
    return { height, id, locked, width, x, y, zIndex };
  });
}

export function resolveWorkspaceTopLevelAutoLayoutGap(
  options: WorkspaceTopLevelAutoLayoutOptions | undefined,
): number {
  if (options === undefined) {
    return DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP;
  }
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new Error("Auto-layout options must be an object.");
  }
  const candidate = options as Record<string, unknown>;
  if (!Object.hasOwn(candidate, "gap") || candidate["gap"] === undefined) {
    return DEFAULT_WORKSPACE_TOP_LEVEL_AUTO_LAYOUT_GAP;
  }
  const gap = candidate["gap"];
  assertFinite(gap, "Auto-layout gap");
  if (gap < 0) {
    throw new Error("Auto-layout gap must be non-negative.");
  }
  return gap;
}

function compareMovableRectangles(
  left: MovableRectangle,
  right: MovableRectangle,
): number {
  return (
    compareNumbers(right.paddedHeight, left.paddedHeight) ||
    compareNumbers(right.paddedWidth, left.paddedWidth) ||
    compareNumbers(left.zIndex, right.zIndex) ||
    compareNumbers(left.y, right.y) ||
    compareNumbers(left.x, right.x) ||
    compareStrings(left.id, right.id)
  );
}

function createMovableRectangles(
  rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  gap: number,
): Array<MovableRectangle> {
  return rectangles
    .filter((rectangle) => !rectangle.locked)
    .map((rectangle) => ({
      ...rectangle,
      paddedHeight: finite(
        rectangle.height + gap,
        `Rectangle ${rectangle.id} padded height`,
      ),
      paddedWidth: finite(
        rectangle.width + gap,
        `Rectangle ${rectangle.id} padded width`,
      ),
    }))
    .sort(compareMovableRectangles);
}

function createShelfWidthCandidates(
  rectangles: ReadonlyArray<MovableRectangle>,
): Array<number> {
  let paddedArea = 0;
  let maximumPaddedWidth = 0;
  let totalPaddedWidth = 0;
  for (const rectangle of rectangles) {
    paddedArea = finite(
      paddedArea +
        finite(
          rectangle.paddedWidth * rectangle.paddedHeight,
          `Rectangle ${rectangle.id} padded area`,
        ),
      "Auto-layout padded area",
    );
    maximumPaddedWidth = Math.max(maximumPaddedWidth, rectangle.paddedWidth);
    totalPaddedWidth = finite(
      totalPaddedWidth + rectangle.paddedWidth,
      "Auto-layout padded width",
    );
  }
  const baseline = finite(Math.sqrt(paddedArea), "Auto-layout baseline");
  const widths = new Set<number>([maximumPaddedWidth, totalPaddedWidth]);
  for (const factor of SHELF_WIDTH_FACTORS) {
    widths.add(
      Math.max(
        maximumPaddedWidth,
        finite(baseline * factor, "Auto-layout shelf width"),
      ),
    );
  }
  return [...widths].sort(compareNumbers);
}

function packShelfCandidate(
  rectangles: ReadonlyArray<MovableRectangle>,
  shelfWidth: number,
  gap: number,
): PackedCandidate {
  let shelfHeight = 0;
  let shelfUsedWidth = 0;
  let hasShelfItem = false;
  let maximumBottom = 0;
  let maximumRight = 0;
  let x = 0;
  let y = 0;
  const placements: Array<PackedPlacement> = [];
  const shelves: Array<Readonly<{ height: number; usedWidth: number }>> = [];

  for (const rectangle of rectangles) {
    if (
      hasShelfItem &&
      finite(x + rectangle.width, "Auto-layout shelf right") > shelfWidth
    ) {
      shelves.push({ height: shelfHeight, usedWidth: shelfUsedWidth });
      y = finite(y + shelfHeight + gap, "Auto-layout next shelf y");
      x = 0;
      shelfHeight = 0;
      shelfUsedWidth = 0;
      hasShelfItem = false;
    }
    const right = finite(x + rectangle.width, "Auto-layout packed right");
    const bottom = finite(y + rectangle.height, "Auto-layout packed bottom");
    placements.push({ rectangle, x, y });
    shelfHeight = Math.max(shelfHeight, rectangle.height);
    shelfUsedWidth = right;
    maximumRight = Math.max(maximumRight, right);
    maximumBottom = Math.max(maximumBottom, bottom);
    x = finite(right + gap, "Auto-layout next shelf x");
    hasShelfItem = true;
  }
  if (hasShelfItem) {
    shelves.push({ height: shelfHeight, usedWidth: shelfUsedWidth });
  }
  assertPositiveFinite(maximumRight, "Auto-layout packed width");
  assertPositiveFinite(maximumBottom, "Auto-layout packed height");
  return { height: maximumBottom, placements, shelves, width: maximumRight };
}

function createCandidateOrigins(
  anchor: Readonly<{ x: number; y: number }>,
  packed: PackedCandidate,
  lockedRectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  gap: number,
): Array<Readonly<{ x: number; y: number }>> {
  if (lockedRectangles.length === 0) {
    return [anchor];
  }
  const firstLocked = lockedRectangles[0];
  if (!firstLocked) {
    throw new Error("Auto-layout locked bounds are missing.");
  }
  let left = firstLocked.x;
  let right = finite(
    firstLocked.x + firstLocked.width,
    "Auto-layout locked right",
  );
  let top = firstLocked.y;
  let bottom = finite(
    firstLocked.y + firstLocked.height,
    "Auto-layout locked bottom",
  );
  for (const rectangle of lockedRectangles.slice(1)) {
    left = Math.min(left, rectangle.x);
    right = Math.max(
      right,
      finite(rectangle.x + rectangle.width, "Auto-layout locked right"),
    );
    top = Math.min(top, rectangle.y);
    bottom = Math.max(
      bottom,
      finite(rectangle.y + rectangle.height, "Auto-layout locked bottom"),
    );
  }
  return [
    anchor,
    {
      x: finite(left - packed.width - gap, "Auto-layout left origin"),
      y: anchor.y,
    },
    { x: finite(right + gap, "Auto-layout right origin"), y: anchor.y },
    {
      x: anchor.x,
      y: finite(top - packed.height - gap, "Auto-layout top origin"),
    },
    { x: anchor.x, y: finite(bottom + gap, "Auto-layout bottom origin") },
  ];
}

function overlapsWithGap(
  left: Pick<
    WorkspaceTopLevelAutoLayoutRectangle,
    "height" | "width" | "x" | "y"
  >,
  right: Pick<
    WorkspaceTopLevelAutoLayoutRectangle,
    "height" | "width" | "x" | "y"
  >,
  gap: number,
): boolean {
  const leftRight = finite(left.x + left.width + gap, "Auto-layout right edge");
  const rightRight = finite(
    right.x + right.width + gap,
    "Auto-layout right edge",
  );
  const leftBottom = finite(
    left.y + left.height + gap,
    "Auto-layout bottom edge",
  );
  const rightBottom = finite(
    right.y + right.height + gap,
    "Auto-layout bottom edge",
  );
  return (
    left.x < rightRight &&
    leftRight > right.x &&
    left.y < rightBottom &&
    leftBottom > right.y
  );
}

function positionPackedCandidate(
  packed: PackedCandidate,
  origin: Readonly<{ x: number; y: number }>,
): Array<PackedPlacement> {
  return packed.placements.map((placement) => ({
    rectangle: placement.rectangle,
    x: finite(origin.x + placement.x, `Rectangle ${placement.rectangle.id} x`),
    y: finite(origin.y + placement.y, `Rectangle ${placement.rectangle.id} y`),
  }));
}

function isCandidateClear(
  placements: ReadonlyArray<PackedPlacement>,
  lockedRectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  gap: number,
): boolean {
  for (const placement of placements) {
    const rectangle = {
      height: placement.rectangle.height,
      width: placement.rectangle.width,
      x: placement.x,
      y: placement.y,
    };
    if (
      lockedRectangles.some((locked) => overlapsWithGap(rectangle, locked, gap))
    ) {
      return false;
    }
  }
  return true;
}

function createCandidateScore(
  packed: PackedCandidate,
  placements: ReadonlyArray<PackedPlacement>,
): Readonly<[number, number, number, number, number]> {
  let contentArea = 0;
  let movement = 0;
  const movementScale = Math.max(packed.width, packed.height, 1);
  for (const placement of placements) {
    contentArea = finite(
      contentArea + placement.rectangle.width * placement.rectangle.height,
      "Auto-layout content area",
    );
    movement = finite(
      movement +
        (Math.abs(placement.x - placement.rectangle.x) +
          Math.abs(placement.y - placement.rectangle.y)) /
          movementScale,
      "Auto-layout movement",
    );
  }
  const compactness = finite(
    (packed.width * packed.height) / contentArea - 1,
    "Auto-layout compactness",
  );
  const aspectRatio = finite(
    packed.width / packed.height,
    "Auto-layout aspect ratio",
  );
  const balance = finite(
    Math.abs(aspectRatio - LANDSCAPE_ASPECT_RATIO) /
      Math.max(aspectRatio, LANDSCAPE_ASPECT_RATIO),
    "Auto-layout balance",
  );
  const raggedness = finite(
    packed.shelves.reduce(
      (total, shelf) => total + (packed.width - shelf.usedWidth),
      0,
    ) /
      (packed.width * packed.shelves.length),
    "Auto-layout raggedness",
  );
  const normalizedMovement = finite(
    movement / placements.length,
    "Auto-layout movement",
  );
  const total = finite(
    compactness * 0.4 +
      balance * 0.3 +
      raggedness * 0.15 +
      normalizedMovement * 0.15,
    "Auto-layout score",
  );
  return [total, compactness, balance, raggedness, normalizedMovement];
}

function compareScores(
  left: Readonly<[number, number, number, number, number]>,
  right: Readonly<[number, number, number, number, number]>,
): number {
  return (
    compareNumbers(left[0], right[0]) ||
    compareNumbers(left[1], right[1]) ||
    compareNumbers(left[2], right[2]) ||
    compareNumbers(left[3], right[3]) ||
    compareNumbers(left[4], right[4])
  );
}

function compareCandidates(
  left: EvaluatedCandidate,
  right: EvaluatedCandidate,
): number {
  return (
    compareScores(left.score, right.score) ||
    compareNumbers(left.shelfWidth, right.shelfWidth) ||
    compareNumbers(left.origin.y, right.origin.y) ||
    compareNumbers(left.origin.x, right.origin.x)
  );
}

function createPlan(
  rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  placements: ReadonlyArray<PackedPlacement>,
): WorkspaceTopLevelAutoLayoutPlan {
  const positions = new Map<string, Readonly<{ x: number; y: number }>>();
  for (const rectangle of rectangles) {
    positions.set(rectangle.id, { x: rectangle.x, y: rectangle.y });
  }
  for (const placement of placements) {
    positions.set(placement.rectangle.id, { x: placement.x, y: placement.y });
  }
  const positionsById = Object.create(null) as Record<
    string,
    Readonly<{ x: number; y: number }>
  >;
  for (const [id, position] of [...positions].sort(([left], [right]) =>
    compareStrings(left, right),
  )) {
    positionsById[id] = Object.freeze({
      x: finite(position.x, `Position ${id} x`),
      y: finite(position.y, `Position ${id} y`),
    });
  }
  return Object.freeze({ positionsById: Object.freeze(positionsById) });
}

export function planWorkspaceTopLevelAutoLayout(
  rectangles: ReadonlyArray<WorkspaceTopLevelAutoLayoutRectangle>,
  options?: WorkspaceTopLevelAutoLayoutOptions,
): WorkspaceTopLevelAutoLayoutPlan {
  const gap = resolveWorkspaceTopLevelAutoLayoutGap(options);
  const validated = validateRectangles(rectangles);
  const movable = createMovableRectangles(validated, gap);
  if (movable.length < 2) {
    return createPlan(validated, []);
  }
  const locked = validated.filter((rectangle) => rectangle.locked);
  const anchor = movable.reduce(
    (current, rectangle) => ({
      x: Math.min(current.x, rectangle.x),
      y: Math.min(current.y, rectangle.y),
    }),
    { x: movable[0]?.x ?? 0, y: movable[0]?.y ?? 0 },
  );
  let best: EvaluatedCandidate | null = null;
  for (const shelfWidth of createShelfWidthCandidates(movable)) {
    const packed = packShelfCandidate(movable, shelfWidth, gap);
    for (const origin of createCandidateOrigins(anchor, packed, locked, gap)) {
      const placements = positionPackedCandidate(packed, origin);
      if (!isCandidateClear(placements, locked, gap)) {
        continue;
      }
      if (
        placements.every(
          (placement) =>
            placement.x === placement.rectangle.x &&
            placement.y === placement.rectangle.y,
        )
      ) {
        return createPlan(validated, placements);
      }
      const candidate: EvaluatedCandidate = {
        origin,
        placements,
        score: createCandidateScore(packed, placements),
        shelfWidth,
      };
      if (best === null || compareCandidates(candidate, best) < 0) {
        best = candidate;
      }
    }
  }
  if (best === null) {
    throw new Error("Auto-layout could not place the movable rectangles.");
  }
  return createPlan(validated, best.placements);
}

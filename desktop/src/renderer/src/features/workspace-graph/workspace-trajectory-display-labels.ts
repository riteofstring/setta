import type {
  WorkspaceTrajectorySprite,
  WorkspaceTrajectorySpriteKind,
  WorkspaceTrajectorySpriteStatus,
} from "@generated/backend";

const canvasLabelMaxLength = 22;

export function trajectorySpritePrimaryLabel(sprite: WorkspaceTrajectorySprite): string {
  if (sprite.kind === "command") {
    return firstNonEmpty(
      normalizeTrajectoryDisplayText(sprite.command.command),
      normalizeTrajectoryDisplayText(sprite.subtitle),
      normalizeTrajectoryDisplayText(sprite.title),
      "Command",
    );
  }
  return firstNonEmpty(
    normalizeTrajectoryDisplayText(sprite.title),
    trajectorySpriteKindLabel(sprite.kind),
  );
}

export function trajectorySpriteSecondaryLabel(sprite: WorkspaceTrajectorySprite): string {
  if (sprite.kind === "command") {
    return `${trajectorySpriteStatusLabel(sprite.status)} ${trajectorySpriteKindLabel(sprite.kind)}`;
  }
  return normalizeTrajectoryDisplayText(sprite.subtitle);
}

export function trajectorySpriteFullDetailLabel(sprite: WorkspaceTrajectorySprite): string {
  if (sprite.kind === "command") {
    return trajectorySpritePrimaryLabel(sprite);
  }
  return firstNonEmpty(
    normalizeTrajectoryDisplayText(sprite.subtitle),
    normalizeTrajectoryDisplayText(sprite.title),
    trajectorySpriteKindLabel(sprite.kind),
  );
}

export function trajectorySpriteCanvasLabel(sprite: WorkspaceTrajectorySprite): string {
  return truncateCanvasLabel(
    normalizeTrajectoryDisplayText(
      `${trajectorySpritePrimaryLabel(sprite)}${trajectorySpriteStatusSuffix(sprite.status)}`,
    ),
  );
}

export function normalizeTrajectoryDisplayText(value: string): string {
  let normalized = "";
  let previousWasSpace = false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (isDisplayWhitespace(character, code)) {
      if (normalized !== "" && !previousWasSpace) {
        normalized += " ";
      }
      previousWasSpace = true;
      continue;
    }
    if (isControlCharacter(code)) {
      continue;
    }
    normalized += character;
    previousWasSpace = false;
  }
  return normalized.trim();
}

export function trajectorySpriteKindLabel(kind: WorkspaceTrajectorySpriteKind): string {
  return kind.replaceAll("_", " ");
}

export function trajectorySpriteStatusLabel(status: WorkspaceTrajectorySpriteStatus): string {
  return status.replaceAll("_", " ");
}

function trajectorySpriteStatusSuffix(status: WorkspaceTrajectorySpriteStatus): string {
  switch (status) {
    case "completed":
      return " done";
    case "failed":
      return " failed";
    case "cancelled":
      return " cancelled";
    case "approval_required":
      return " approval";
    case "pending":
      return " pending";
    case "unknown":
    case "running":
      return "";
  }
}

function truncateCanvasLabel(value: string): string {
  const clean = value.replace(/[^\x20-\x7e]/g, "?");
  return clean.length <= canvasLabelMaxLength ? clean : `${clean.slice(0, 19)}...`;
}

function firstNonEmpty(...values: string[]): string {
  return values.find((value) => value !== "") ?? "";
}

function isDisplayWhitespace(character: string, code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13) || (code > 127 && character.trim() === "");
}

function isControlCharacter(code: number): boolean {
  return code < 32 || code === 127;
}

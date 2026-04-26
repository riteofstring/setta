export const PROJECT_CANVAS_SHOWCASE_EFFECT_STORAGE_KEY = "settaCanvasEffect";

const PROJECT_CANVAS_SHOWCASE_EFFECT_QUERY_KEYS = [
  "canvasEffect",
  "settaCanvasEffect",
] as const;

const ENABLED_CANVAS_SHOWCASE_EFFECT_VALUES = new Set([
  "",
  "1",
  "aurora",
  "on",
  "showcase",
  "true",
  "yes",
]);

const DISABLED_CANVAS_SHOWCASE_EFFECT_VALUES = new Set([
  "0",
  "disabled",
  "false",
  "none",
  "off",
  "no",
]);

export type ProjectCanvasShowcaseEffect = "aurora";

export function resolveProjectCanvasShowcaseEffectFromBrowser(): ProjectCanvasShowcaseEffect | null {
  if (typeof window === "undefined") {
    return null;
  }
  return resolveProjectCanvasShowcaseEffectFromValues({
    search: window.location.search,
    storedValue: window.localStorage.getItem(
      PROJECT_CANVAS_SHOWCASE_EFFECT_STORAGE_KEY,
    ),
  });
}

export function resolveProjectCanvasShowcaseEffectFromValues({
  search,
  storedValue,
}: {
  readonly search: string;
  readonly storedValue: string | null;
}): ProjectCanvasShowcaseEffect | null {
  const params = new URLSearchParams(search);
  for (const key of PROJECT_CANVAS_SHOWCASE_EFFECT_QUERY_KEYS) {
    if (params.has(key)) {
      return resolveProjectCanvasShowcaseEffectValue(params.get(key) ?? "");
    }
  }
  return resolveProjectCanvasShowcaseEffectValue(storedValue);
}

function resolveProjectCanvasShowcaseEffectValue(
  value: string | null,
): ProjectCanvasShowcaseEffect | null {
  if (value === null) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (DISABLED_CANVAS_SHOWCASE_EFFECT_VALUES.has(normalized)) {
    return null;
  }
  if (ENABLED_CANVAS_SHOWCASE_EFFECT_VALUES.has(normalized)) {
    return "aurora";
  }
  return null;
}

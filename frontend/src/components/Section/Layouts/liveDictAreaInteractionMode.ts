import {
  activateParamSelect,
  deactivateParamSelect,
} from "state/actions/paramSelect";

export const LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM =
  "liveDictAreaInteractionMode";

export const LIVE_DICT_AREA_INTERACTION_MODES = [
  "default",
  "param-select",
] as const;

export type LiveDictAreaInteractionMode =
  (typeof LIVE_DICT_AREA_INTERACTION_MODES)[number];

export function resolveLiveDictAreaInteractionMode({
  search,
}: {
  search: string | null | undefined;
}): LiveDictAreaInteractionMode {
  const requestedMode = new URLSearchParams(search ?? "").get(
    LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM,
  );

  if (isLiveDictAreaInteractionMode(requestedMode)) {
    return requestedMode;
  }

  return "default";
}

export function syncLiveDictAreaInteractionModeFromSearch(
  search: string | null | undefined,
): void {
  const interactionMode = resolveLiveDictAreaInteractionMode({ search });

  if (interactionMode === "param-select") {
    activateParamSelect();
    return;
  }

  deactivateParamSelect();
}

function isLiveDictAreaInteractionMode(
  value: string | null | undefined,
): value is LiveDictAreaInteractionMode {
  return LIVE_DICT_AREA_INTERACTION_MODES.includes(
    value as LiveDictAreaInteractionMode,
  );
}

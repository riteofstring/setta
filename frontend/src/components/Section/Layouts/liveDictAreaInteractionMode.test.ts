import { describe, expect, it } from "vitest";
import {
  LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM,
  resolveLiveDictAreaInteractionMode,
} from "./liveDictAreaInteractionMode";

describe("resolveLiveDictAreaInteractionMode", () => {
  it("defaults to the regular interaction mode when the query param is absent", () => {
    expect(
      resolveLiveDictAreaInteractionMode({
        search: "",
      }),
    ).toBe("default");
    expect(
      resolveLiveDictAreaInteractionMode({
        search: null,
      }),
    ).toBe("default");
  });

  it("enables param-select interaction only for the explicit canary query param", () => {
    expect(
      resolveLiveDictAreaInteractionMode({
        search: `?${LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM}=param-select`,
      }),
    ).toBe("param-select");
    expect(
      resolveLiveDictAreaInteractionMode({
        search: `?${LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM}=unknown-mode`,
      }),
    ).toBe("default");
  });
});

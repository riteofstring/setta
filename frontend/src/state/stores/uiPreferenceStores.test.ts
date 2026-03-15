import { describe, expect, it } from "vitest";
import {
  partializeUIPreferenceState,
  sanitizePersistedUIPreferenceState,
} from "./uiPreferencePersistence";
import { createDefaultUIPreferenceState } from "./uiPreferenceState";
import { useLocalStorage } from "./uiPreferenceStores";

describe("uiPreferenceStores", () => {
  it("wires the persisted UI preference helpers into the store", () => {
    const options = useLocalStorage.persist.getOptions();

    expect(useLocalStorage.getState()).toEqual(
      createDefaultUIPreferenceState(),
    );
    expect(options.merge).toBe(sanitizePersistedUIPreferenceState);
    expect(options.partialize).toBe(partializeUIPreferenceState);
    expect(options.name).toBe("setta_data");
  });
});

import { describe, expect, it } from "vitest";

import {
  resolveActionBinding,
  resolveParamBinding,
} from "./appBindings";

describe("AppRenderer data bindings", () => {
  it("uses data bindings to fill param ids", () => {
    const bindings = {
      "/params/name": {
        sectionId: "section-1",
        paramId: "param-1",
        label: "Name",
      },
    };
    const resolved = resolveParamBinding({ dataPath: "/params/name" }, bindings);

    expect(resolved.sectionId).toBe("section-1");
    expect(resolved.paramId).toBe("param-1");
    expect(resolved.label).toBe("Name");
  });

  it("prefers explicit props over data bindings", () => {
    const bindings = {
      "/params/name": {
        sectionId: "section-1",
        paramId: "param-1",
        label: "Name",
      },
    };
    const resolved = resolveParamBinding(
      {
        dataPath: "/params/name",
        sectionId: "section-override",
        paramId: "param-override",
      },
      bindings,
    );

    expect(resolved.sectionId).toBe("section-override");
    expect(resolved.paramId).toBe("param-override");
  });

  it("uses data bindings to resolve action names", () => {
    const bindings = {
      "/actions/download": {
        action: "downloadReport",
        sectionId: "section-2",
      },
    };
    const resolved = resolveActionBinding(
      { dataPath: "/actions/download" },
      bindings,
    );

    expect(resolved.action).toBe("downloadReport");
    expect(resolved.sectionId).toBe("section-2");
  });
});

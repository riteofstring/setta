import { describe, expect, it } from "vitest";

import { graphModeCssVariable, graphModeCssVariables } from "./graph-mode-css";
import { graphModeColor } from "./graph-visual-language";
import { packedGraphModes } from "../packed-graph-vocabulary";

describe("graph mode CSS variables", () => {
  it("publishes one variable per mode the shaders paint", () => {
    const variables = graphModeCssVariables();
    expect(Object.keys(variables).sort()).toEqual(
      [...packedGraphModes].map((mode) => graphModeCssVariable(mode)).sort(),
    );
  });

  // The point of deriving these is that a failing artifact and a failing node
  // cannot drift apart. Pinning the conversion is what makes that true: before
  // this existed the hand-matched copies were out by up to 32 degrees of hue.
  it("converts each mode to the colour its shader triple describes", () => {
    const variables = graphModeCssVariables();
    for (const [mode, [red, green, blue]] of Object.entries(graphModeColor)) {
      const channel = (value: number): number => Math.round(value * 255);
      expect(variables[graphModeCssVariable(mode)]).toBe(
        `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`,
      );
    }
  });
});

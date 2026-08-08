import { renderToStaticMarkup } from "react-dom/server";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SelectionContextMenu } from "./SelectionContextMenu";

describe("SelectionContextMenu", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("stays inert while closed against the reset placeholder project state", () => {
    const render = () => renderToStaticMarkup(<SelectionContextMenu />);

    expect(render).not.toThrow();
    expect(render()).toBe("");
  });
});

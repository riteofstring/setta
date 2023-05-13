import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { KwargsControls } from "components/UI/Section/SectionContainer/Main/KwargsControls/KwargsControls";
import { createDefaultSectionInfo } from "thunks/sections/createSectionInfo";
import { getKwargIds } from "thunks/sections/sectionContents";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import { loadTestDataIntoState } from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

describe("KwargControls", () => {
  beforeAll(async () => {
    await loadTestDataIntoState();
  });

  it("should add a kwarg to an empty section without crashing", async () => {
    const sectionId = createDefaultSectionInfo({})[0];
    const props = { sectionId, objInfoId: NULL_OBJ_ID };
    render(<KwargsControls {...props} />);

    // there should be no kwargs
    let kwargIds = getKwargIds(sectionId, NULL_OBJ_ID);
    expect(kwargIds.length).toEqual(0);

    const button = screen.getByRole("button", { name: "Add Kwarg" });
    await userEvent.click(button);
    // now there should be 1 kwarg
    kwargIds = getKwargIds(sectionId, NULL_OBJ_ID);
    expect(kwargIds.length).toEqual(1);
  });
});

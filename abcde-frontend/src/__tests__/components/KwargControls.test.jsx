import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import { renderUseGetKwargInfos } from "__tests__utils/renderHooks";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import { loadTestDataIntoState, sectionIdFromName } from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

test("Adding kwarg on parameter-only section should work", async () => {
  await loadTestDataIntoState();
  const sectionId = sectionIdFromName("The2ndOtherParameters");
  const props = { sectionId, parentId: null, ancestorSet: {} };

  render(<SectionContainer {...props} />);

  // there should be no kwargs
  let { result } = renderUseGetKwargInfos(sectionId, NULL_OBJ_ID);
  expect(result.current.length).toEqual(0);
  const initialLength = result.current.length;

  const button = screen.getByRole("button", { name: "Add Kwarg" });
  await userEvent.click(button);

  // now there should be +1 kwarg
  ({ result } = renderUseGetKwargInfos(sectionId, NULL_OBJ_ID));
  expect(result.current.length).toEqual(initialLength + 1);
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { SectionSearch } from "components/UI/Section/SectionContainer/Main/Search/Search";
import { useCodeInfo } from "models/info/codeInfo";
import { getSectionInfo, setSelectedItem } from "thunks/sections/sections";
import {
  getReactFlowProvider,
  loadTestDataIntoState,
  ResizeObserver,
  sectionIdFromName,
} from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

test("Test SectionSearch", async () => {
  await loadTestDataIntoState();
  const sectionId = sectionIdFromName("Optimizer");
  setSelectedItem(sectionId, NULL_OBJ_ID);
  render(<SectionSearch sectionId={sectionId} />, {
    wrapper: getReactFlowProvider(),
  });

  // Expect that this section doesn't have any selection
  let { selectedItem } = getSectionInfo(sectionId);
  expect(selectedItem).toEqual(NULL_OBJ_ID);

  // search box should be empty
  let searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("");

  await userEvent.clear(searchBox);
  await userEvent.type(searchBox, "SGD");
  await userEvent.keyboard("{arrowdown}");
  await userEvent.tab();
  expect(searchBox.value).toEqual("SGD");

  // Expect that the SGD object is now selected
  ({ selectedItem } = getSectionInfo(sectionId));
  expect(useCodeInfo.getState().allCodeInfo[selectedItem].name).toEqual("SGD");
});

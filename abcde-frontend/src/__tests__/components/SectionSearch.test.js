import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import { renderUseGetSectionConfig } from "__tests__utils/renderHooks";
import { sectionIdFromName } from "__tests__utils/utils";

test("Test SectionSearch", async () => {
  const { store, wrapper } = createStoreWrapperWithData();
  const sectionId = sectionIdFromName(store, "Optimizer");
  render(<SectionContainer sectionId={sectionId} parentId={null} depth={0} />, {
    wrapper,
  });

  // Expect that this section doesn't have any selection
  let { result } = renderUseGetSectionConfig(sectionId, wrapper);
  expect(result.current.selectedItem).toEqual(null);

  // search box should be empty
  const searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("");

  await userEvent.clear(searchBox);
  await userEvent.type(searchBox, "SGD");
  await userEvent.type(searchBox, "{arrowdown}");
  await userEvent.tab();

  // Expect that the SGD object is now selected
  ({ result } = renderUseGetSectionConfig(sectionId, wrapper));
  expect(result.current.selectedItem).toEqual(
    "0c264e90-eb09-4dfb-bb5b-b357037b2a08"
  );
});

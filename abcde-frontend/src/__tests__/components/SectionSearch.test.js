import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import _ from "lodash";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import {
  changeUITypeConfig,
  renderUseGetSectionConfig,
  renderUseGetSectionType,
} from "__tests__utils/renderHooks";
import { sectionIdFromName } from "__tests__utils/utils";

test("Test SectionSearch", async () => {
  const { store, wrapper } = createStoreWrapperWithData();
  const sectionId = sectionIdFromName(store, "Optimizer");
  const props = { sectionId, parentId: null, depth: 0 };

  const { rerender } = render(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect that this section doesn't have any selection
  let { result } = renderUseGetSectionConfig(sectionId, wrapper);
  expect(result.current.selectedItem).toEqual(null);

  // search box should be empty
  let searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("");

  await userEvent.clear(searchBox);
  await userEvent.type(searchBox, "SGD");
  await userEvent.type(searchBox, "{arrowdown}");
  await userEvent.tab();

  // Expect that the SGD object is now selected
  const idSGD = "0c264e90-eb09-4dfb-bb5b-b357037b2a08";
  ({ result } = renderUseGetSectionConfig(sectionId, wrapper));
  expect(result.current.selectedItem).toEqual(idSGD);

  // Get another collection
  const newCollection = _.filter(
    store.getState().master.allCollections,
    (x) => x.name === "models"
  )[0];

  // Add collection to section
  ({ result } = renderUseGetSectionType(sectionId, wrapper));

  const hookProps = {
    sectionId,
    settingSectionConfig: true,
    currUIType: result.current,
  };

  changeUITypeConfig(
    hookProps,
    "collections",
    (x) => [...x, newCollection.id],
    wrapper
  );

  // rerender (not sure why this is necessary actually)
  rerender(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect selectedItem to be unchanged
  ({ result } = renderUseGetSectionConfig(sectionId, wrapper));
  expect(result.current.selectedItem).toEqual(idSGD);

  // Make section only have models
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  changeUITypeConfig(
    { ...hookProps, currUIType: result.current },
    "collections",
    () => [newCollection.id],
    wrapper
  );

  // rerender (not sure why this is necessary actually)
  rerender(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect selectedItem to be null now that its item is no longer available in the combobox
  ({ result } = renderUseGetSectionConfig(sectionId, wrapper));
  expect(result.current.selectedItem).toEqual(null);

  // search box should be empty
  searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("");

  // select item
  await userEvent.type(searchBox, "resnet");
  await userEvent.type(searchBox, "{arrowdown}");
  await userEvent.tab();
  expect(result.current.selectedItem).toBeTruthy();

  // Make section have no searchable items
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  changeUITypeConfig(
    { ...hookProps, currUIType: result.current },
    "collections",
    () => [],
    wrapper
  );

  // rerender (not sure why this is necessary actually)
  rerender(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect selectedItem to be null now that its item is no longer available in the combobox
  ({ result } = renderUseGetSectionConfig(sectionId, wrapper));
  expect(result.current.selectedItem).toEqual(null);
});

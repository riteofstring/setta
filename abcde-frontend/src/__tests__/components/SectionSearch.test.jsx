import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import _ from "lodash";
import {
  renderUseGetSectionConfig,
  renderUseGetSectionType,
} from "__tests__utils/renderHooks";
import {
  createStoreWrapperWithData,
  sectionIdFromName,
} from "__tests__utils/utils";

test("Test SectionSearch", async () => {
  const { store, wrapper } = await createStoreWrapperWithData({});
  const sectionId = sectionIdFromName(store, "Optimizer");
  const props = { sectionId, parentId: null, depth: 0 };

  const { rerender } = render(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect that this section doesn't have any selection
  let { result } = renderUseGetSectionConfig(
    sectionId,
    ["selectedItem"],
    wrapper
  );
  expect(result.current[0]).toEqual(null);

  // search box should be empty
  let searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("");

  await userEvent.clear(searchBox);
  await userEvent.type(searchBox, "SGD");
  await userEvent.type(searchBox, "{arrowdown}");
  await userEvent.tab();

  // Expect that the SGD object is now selected
  const idSGD = "0c264e90-eb09-4dfb-bb5b-b357037b2a08";
  ({ result } = renderUseGetSectionConfig(
    sectionId,
    ["selectedItem"],
    wrapper
  ));
  expect(result.current[0]).toEqual(idSGD);

  // Get another collection
  const newCollection = _.filter(
    store.getState().codeInfo.allCollections,
    (x) => x.name === "Torchvision Models"
  )[0];

  // Add collection to section
  ({ result } = renderUseGetSectionType(sectionId, wrapper));

  await waitFor(() =>
    store.getActions().thunks.setSectionUITypeConfig({
      sectionId,
      configProps: {
        configName: "collections",
        newValueFn: (x) => [...x, newCollection.id],
      },
    })
  );

  // rerender (not sure why this is necessary actually)
  rerender(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect selectedItem to be unchanged
  ({ result } = renderUseGetSectionConfig(
    sectionId,
    ["selectedItem"],
    wrapper
  ));
  expect(result.current[0]).toEqual(idSGD);

  // Make section only have models
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  await waitFor(() =>
    store.getActions().thunks.setSectionUITypeConfig({
      sectionId,
      configProps: {
        configName: "collections",
        newValueFn: () => [newCollection.id],
      },
    })
  );

  // rerender (not sure why this is necessary actually)
  rerender(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect selectedItem to be null now that its item is no longer available in the combobox
  ({ result } = renderUseGetSectionConfig(
    sectionId,
    ["selectedItem"],
    wrapper
  ));
  expect(result.current[0]).toEqual(null);

  // search box should be empty
  searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("");

  // select item
  await userEvent.type(searchBox, "resnet");
  await userEvent.type(searchBox, "{arrowdown}");
  await userEvent.tab();
  expect(result.current[0]).toBeTruthy();

  // Make section have no searchable items
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  await waitFor(() =>
    store.getActions().thunks.setSectionUITypeConfig({
      sectionId,
      configProps: {
        configName: "collections",
        newValueFn: () => [],
      },
    })
  );

  // rerender (not sure why this is necessary actually)
  rerender(<SectionContainer {...props} />, {
    wrapper,
  });

  // Expect selectedItem to be null now that its item is no longer available in the combobox
  ({ result } = renderUseGetSectionConfig(
    sectionId,
    ["selectedItem"],
    wrapper
  ));
  expect(result.current[0]).toEqual(null);
});

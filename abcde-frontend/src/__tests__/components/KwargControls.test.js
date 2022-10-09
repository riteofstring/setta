import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import { sectionIdFromName } from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

test("Adding kwarg on parameter-only section should work", async () => {
  const { store, wrapper } = createStoreWrapperWithData();
  const sectionId = sectionIdFromName(store, "OtherParameters");
  const props = { sectionId, parentId: null, depth: 0 };

  render(<SectionContainer {...props} />, { wrapper });

  const button = screen.getByRole("button", { name: "Add Kwarg" });

  // should not fail
  await userEvent.click(button);
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import {
  createStoreWrapperWithData,
  sectionIdFromName,
} from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

test("Delete active section while ui config pane is open", async () => {
  const { store, wrapper } = await createStoreWrapperWithData();
  render(<MainContainer />, {
    wrapper,
  });

  // make the parameter config pane active
  const uiConfigButton = screen.getByTestId("UiEditor Parameters Button");
  await userEvent.click(uiConfigButton);

  // set activeSection to sectionId
  const sectionId = sectionIdFromName(store, "Optimizer");
  await waitFor(() => store.getActions().activeSection.setId(sectionId));

  // should run without error
  const deleteButton = screen.getByTestId(`Delete ${sectionId}`);
  await userEvent.click(deleteButton);
});

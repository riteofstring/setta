import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMainContainer } from "__tests__utils/createMainContainer";
import { sectionIdFromName } from "__tests__utils/utils";

test("Delete active section while ui config pane is open", async () => {
  const { store } = await createMainContainer();

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

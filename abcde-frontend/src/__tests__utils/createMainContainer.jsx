import { render, screen, waitFor } from "@testing-library/react";
import MainContainer from "components/AppContainer/Main/MainContainer";
import {
  createStoreWrapperWithData,
  sectionIdFromName,
} from "__tests__utils/utils";

export async function createMainContainer() {
  const { store, wrapper } = await createStoreWrapperWithData({
    loadData: false,
  });
  render(<MainContainer />, {
    wrapper,
  });
  await waitFor(() => expect(store.getState().project.id).toBeTruthy());

  // make sure overview items are rendered
  const sections = store.getState().sectionInfos.x;
  await waitFor(() =>
    expect(getAllOverviewListings().length).toEqual(
      Object.values(sections).length
    )
  );

  // make sure sections are rendered
  const sectionId = sectionIdFromName(store, "Model");
  await waitFor(() => screen.getByTestId(`${sectionId} section core`));

  return { store, wrapper };
}

export function getOverviewSearch() {
  return screen.getByRole("textbox", {
    name: "Overview Search",
  });
}

export function getAllOverviewListings() {
  const overviewListingRegex = /Overview Listing .+/;
  return screen.getAllByTestId(overviewListingRegex);
}

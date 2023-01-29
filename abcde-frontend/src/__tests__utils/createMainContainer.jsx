import { render, screen, waitFor } from "@testing-library/react";
import { MainContainer } from "components/AppContainer/Main/MainContainer";
import { useAuth } from "models/auth";
import { useProject } from "models/info/project";
import { useSectionInfos } from "models/info/sectionInfos";
import { resetAllStores } from "models/utils";
import { getReactFlowProvider, sectionIdFromName } from "__tests__utils/utils";
import { ResizeObserver } from "./resizeObserverDummy";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

export async function createMainContainer() {
  resetAllStores();
  useAuth.getState().loginSuccess({});
  render(<MainContainer />, { wrapper: getReactFlowProvider() });
  await waitFor(() => expect(useProject.getState().id).toBeTruthy());

  // make sure overview items are rendered
  const sections = useSectionInfos.getState().x;
  await waitFor(() =>
    expect(getAllOverviewListings().length).toEqual(
      Object.values(sections).length
    )
  );

  // make sure sections are rendered
  const sectionId = sectionIdFromName("Model");
  await waitFor(() => screen.getByTestId(`${sectionId} section core`));
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

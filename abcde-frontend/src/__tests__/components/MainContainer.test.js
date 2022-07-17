import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadTestData } from "__tests__utils/loadTestData";
import { getStoreProviderWrapper } from "__tests__utils/utils";
import { createStore } from "__tests__utils/utils";
import MainContainer from "components/AppContainer/Main/MainContainer";

global.ResizeObserver = require("resize-observer-polyfill");

test("Tab away from Overview", () => {
  const store = createStore();
  store.getActions().master.loadSections(loadTestData());
  const wrapper = getStoreProviderWrapper(store);

  render(<MainContainer />, {
    wrapper,
  });

  const overviewSearch = screen.getByRole("textbox", {
    name: "Overview Search",
  });
  overviewSearch.focus();
  userEvent.tab();

  const modelSectionTitle = screen.getByDisplayValue("Model");
  screen.debug(modelSectionTitle);
  expect(modelSectionTitle).toHaveFocus();
});

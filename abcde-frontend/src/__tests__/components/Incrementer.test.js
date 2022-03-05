import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addInfo, addChild } from "__tests__utils/utils";
import Incrementer from "components/UI/Section/SectionContainer/Incrementer/Incrementer";
import { createStore, StoreProvider } from "easy-peasy";
import _ from "lodash";
import paramInfos from "models/info/paramInfos";
import sectionInfos from "models/info/sectionInfos";
import uiTypes from "models/info/uiTypes";

test("Incrementer", () => {
  const store = createStore({ sectionInfos, paramInfos, uiTypes });
  const si1 = addInfo(store);
  const si2 = addInfo(store);
  addChild(store, si1, si2.id);

  const wrapper = ({ children }) => (
    <StoreProvider store={store}>{children}</StoreProvider>
  );
  render(
    <Incrementer parentId={si1.id} sectionId={si2.id} isListRoot={false} />,
    { wrapper }
  );
  const addChildButton = screen.getByRole("button", {
    name: "Add child section",
  });
  userEvent.click(addChildButton);

  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[si1.id];

  // 3 sections
  expect(_.size(state.x)).toEqual(3);
  // 1 parent, 2 children, so only 1 entry in idsOverview
  expect(_.size(state.idsOverview)).toEqual(1);
  expect(childrenInfoId).toBeTruthy();
  expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(2);
});

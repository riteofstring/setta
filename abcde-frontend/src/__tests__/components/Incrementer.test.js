import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addInfo, addChild } from "__tests__utils/utils";
import Incrementer from "components/UI/Section/SectionContainer/Incrementer/Incrementer";
import { createStore, StoreProvider } from "easy-peasy";
import { useAddChild } from "hooks/useAddDeleteChild";
import _ from "lodash";
import paramInfos from "models/info/paramInfos";
import sectionInfos from "models/info/sectionInfos";
import uiTypes from "models/info/uiTypes";

test("Incrementer: add sibling", () => {
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

  // nextId is not provided, so the delete button should be disabled
  assertDeleteIsDisabled();
  assertNumChildren(store, si1, 1);
});

test("Incrementer: add child", () => {
  const store = createStore({ sectionInfos, paramInfos, uiTypes });
  const si = addInfo(store);

  const wrapper = ({ children }) => (
    <StoreProvider store={store}>{children}</StoreProvider>
  );

  function IncrementerParent() {
    const addChild = useAddChild(si.id);
    return (
      <Incrementer sectionId={si.id} isListRoot={true} addChild={addChild} />
    );
  }

  render(<IncrementerParent />, { wrapper });

  assertDeleteIsDisabled();
  assertNumChildren(store, si, 0);
});

function assertDeleteIsDisabled() {
  const deleteChildButton = screen.getByRole("button", {
    name: "Delete child section",
  });
  expect(deleteChildButton).toBeDisabled();
}

function assertNumChildren(store, sectionInfo, numInitialChildren) {
  for (let x of _.range(5)) {
    const addChildButton = screen.getByRole("button", {
      name: "Add child section",
    });
    userEvent.click(addChildButton);

    const state = store.getState().sectionInfos;
    const childrenInfoId = state.idsOverview[sectionInfo.id];
    const numAdded = x + 1;

    // parent plus children
    expect(_.size(state.x)).toEqual(1 + numInitialChildren + numAdded);
    // 1 parent so only 1 entry in idsOverview
    expect(_.size(state.idsOverview)).toEqual(1);
    expect(childrenInfoId).toBeTruthy();
    expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(
      numInitialChildren + numAdded
    );
  }
}

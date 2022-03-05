import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addInfo, addChild } from "__tests__utils/utils";
import Incrementer from "components/UI/Section/SectionContainer/Incrementer/Incrementer";
import { createStore, StoreProvider } from "easy-peasy";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
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
  assertDeleteChildIsDisabled();
  clickAddChild(store, si1, 1);
});

test("Incrementer: delete self", () => {
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
  assertDeleteChildIsDisabled();
  const deleteSelf = screen.getByRole("button", {
    name: "Delete self",
  });
  userEvent.click(deleteSelf);

  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[si1.id];
  expect(_.size(state.x)).toEqual(1);
  expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(0);
  expect(state.x[si2.id]).toBeUndefined();
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

  assertDeleteChildIsDisabled();
  clickAddChild(store, si, 0);
});

test("Incrementer: delete child", () => {
  const store = createStore({ sectionInfos, paramInfos, uiTypes });
  const si1 = addInfo(store);
  const numInitialChildren = 4;
  _.range(numInitialChildren).forEach(() => {
    const si2 = addInfo(store);
    addChild(store, si1, si2.id);
  });

  const wrapper = ({ children }) => (
    <StoreProvider store={store}>{children}</StoreProvider>
  );

  function IncrementerParent() {
    const deleteChild = useDeleteChild(si1.id);
    return (
      <Incrementer
        sectionId={si1.id}
        isListRoot={true}
        deleteChild={deleteChild}
        hasNested={true}
      />
    );
  }

  render(<IncrementerParent />, { wrapper });
  assertDeleteChildIsEnabled();
  clickDeleteChild(store, si1, numInitialChildren);
});

function assertDeleteChildIsDisabled() {
  const deleteChildButton = screen.getByRole("button", {
    name: "Delete child section",
  });
  expect(deleteChildButton).toBeDisabled();
}

function assertDeleteChildIsEnabled() {
  const deleteChildButton = screen.getByRole("button", {
    name: "Delete child section",
  });
  expect(deleteChildButton).not.toBeDisabled();
}

function clickAddChild(store, sectionInfo, numInitialChildren) {
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

function clickDeleteChild(store, sectionInfo, numInitialChildren) {
  for (let x of _.range(numInitialChildren)) {
    const deleteChildButton = screen.getByRole("button", {
      name: "Delete child section",
    });
    userEvent.click(deleteChildButton);

    const state = store.getState().sectionInfos;
    const childrenInfoId = state.idsOverview[sectionInfo.id];
    const numDeleted = x + 1;

    // parent plus children
    expect(_.size(state.x)).toEqual(1 + numInitialChildren - numDeleted);
    // 1 parent so only 1 entry in idsOverview
    expect(_.size(state.idsOverview)).toEqual(1);
    expect(childrenInfoId).toBeTruthy();
    expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(
      numInitialChildren - numDeleted
    );
  }
}

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  addSectionInfo,
  addChild,
  getStoreProviderWrapper,
} from "__tests__utils/utils";
import { createStore } from "__tests__utils/utils";
import Incrementer from "components/UI/Section/SectionContainer/Incrementer/Incrementer";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import _ from "lodash";

test("Incrementer: click add sibling N times", () => {
  const [store, parent] = addSiblingSetup();
  clickAddChildNTimes(store, parent, 1, 5);
});

test("Incrementer: click add N siblings", () => {
  const [store, parent] = addSiblingSetup();
  clickAddNChildren(store, parent, 1, 5);
});

test("Incrementer: delete self", () => {
  const store = createStore();
  const si1 = addSectionInfo(store);
  const si2 = addSectionInfo(store);
  addChild(store, si1, si2.id);
  const wrapper = getStoreProviderWrapper(store);
  render(
    <Incrementer parentId={si1.id} sectionId={si2.id} isListRoot={false} />,
    { wrapper }
  );
  // nextId is not provided, so the delete button should be disabled
  assertDeleteChildIsDisabled();
  clickDeleteSelf(store, si1, si2);
});

test("Incrementer: click add child N times ", () => {
  const [store, parent] = addChildSetup();
  clickAddChildNTimes(store, parent, 0, 5);
});

test("Incrementer: click add N children ", () => {
  const [store, parent] = addChildSetup();
  clickAddNChildren(store, parent, 0, 5);
});

test("Incrementer: delete child", () => {
  const store = createStore();
  const si1 = addSectionInfo(store);
  const numChildren = 4;
  _.range(numChildren).forEach(() => {
    const si2 = addSectionInfo(store);
    addChild(store, si1, si2.id);
  });
  const wrapper = getStoreProviderWrapper(store);

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
  clickDeleteChildNTimes(store, si1, numChildren, numChildren);
});

function addSiblingSetup() {
  const store = createStore();
  const si1 = addSectionInfo(store);
  const si2 = addSectionInfo(store);
  addChild(store, si1, si2.id);
  const wrapper = getStoreProviderWrapper(store);
  render(
    <Incrementer parentId={si1.id} sectionId={si2.id} isListRoot={false} />,
    { wrapper }
  );
  // nextId is not provided, so the delete button should be disabled
  assertDeleteChildIsDisabled();
  return [store, si1];
}

function addChildSetup() {
  const store = createStore();
  const si = addSectionInfo(store);
  const wrapper = getStoreProviderWrapper(store);

  function IncrementerParent() {
    const addChild = useAddChild(si.id);
    return (
      <Incrementer sectionId={si.id} isListRoot={true} addChild={addChild} />
    );
  }

  render(<IncrementerParent />, { wrapper });
  assertDeleteChildIsDisabled();
  return [store, si];
}

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

function assertNChildrenAdded(store, parent, numInitialChildren, N) {
  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[parent.id];

  // parent plus children
  expect(_.size(state.x)).toEqual(1 + numInitialChildren + N);
  // 1 parent so only 1 entry in idsOverview
  expect(_.size(state.idsOverview)).toEqual(1);
  expect(childrenInfoId).toBeTruthy();
  expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(
    numInitialChildren + N
  );
}

function clickAddChildNTimes(store, parent, numInitialChildren, N) {
  for (let x of _.range(N)) {
    const addChildButton = screen.getByRole("button", {
      name: "Add child section",
    });
    userEvent.click(addChildButton);
    assertNChildrenAdded(store, parent, numInitialChildren, x + 1);
  }
}

function clickAddNChildren(store, parent, numInitialChildren, N) {
  const numSectionsInput = screen.getByRole("textbox", {
    name: "Number of sections",
  });
  const addChildButton = screen.getByRole("button", {
    name: "Add child section",
  });
  userEvent.clear(numSectionsInput);
  userEvent.type(numSectionsInput, N.toString());
  userEvent.click(addChildButton);
  assertNChildrenAdded(store, parent, numInitialChildren, N);
}

function clickDeleteChildNTimes(store, sectionInfo, numInitialChildren, N) {
  for (let x of _.range(N)) {
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

function clickDeleteSelf(store, parent, child) {
  const deleteSelf = screen.getByRole("button", {
    name: "Delete self",
  });
  userEvent.click(deleteSelf);

  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[parent.id];
  expect(_.size(state.x)).toEqual(1);
  expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(0);
  expect(state.x[child.id]).toBeUndefined();
}

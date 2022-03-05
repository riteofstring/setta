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
  const { store, parent } = componentSetup({
    forParent: false,
    numChildren: 1,
  });
  clickAddChildNTimes(store, parent, 1, 5);
});

test("Incrementer: click add N siblings", () => {
  const { store, parent } = componentSetup({
    forParent: false,
    numChildren: 1,
  });
  clickAddNChildren(store, parent, 1, 5);
});

test("Incrementer: delete self", () => {
  const { store, parent, childrenInfos } = componentSetup({
    forParent: false,
    numChildren: 1,
  });
  clickDeleteSelf(store, parent, childrenInfos[0]);
});

test("Incrementer: click add child N times ", () => {
  const { store, parent } = componentSetup({ forParent: true, numChildren: 1 });
  clickAddChildNTimes(store, parent, 1, 5);
});

test("Incrementer: click add N children ", () => {
  const { store, parent } = componentSetup({ forParent: true, numChildren: 1 });
  clickAddNChildren(store, parent, 1, 5);
});

test("Incrementer: delete child", () => {
  const { store, parent } = componentSetup({
    forParent: true,
    numChildren: 4,
  });
  clickDeleteChildNTimes(store, parent, 4, 4);
});

function componentSetup({ forParent, numChildren }) {
  const store = createStore();
  const parent = addSectionInfo(store);
  let childrenInfos = [];
  _.range(numChildren).forEach(() => {
    const child = addSectionInfo(store);
    addChild(store, parent, child.id);
    childrenInfos.push(child);
  });
  const wrapper = getStoreProviderWrapper(store);

  // increment for one of the children
  function IncrementerForChild() {
    return (
      <Incrementer
        parentId={parent.id}
        sectionId={childrenInfos[0].id}
        nextId={childrenInfos.length > 1 ? childrenInfos[1].id : null}
        isListRoot={false}
      />
    );
  }

  // increment for one of the children
  function IncrementerForParent() {
    const addChild = useAddChild(parent.id);
    const deleteChild = useDeleteChild(parent.id);
    return (
      <Incrementer
        sectionId={parent.id}
        isListRoot={true}
        addChild={addChild}
        deleteChild={deleteChild}
        hasNested={true}
      />
    );
  }

  render(forParent ? <IncrementerForParent /> : <IncrementerForChild />, {
    wrapper,
  });

  if ((forParent && numChildren > 0) || (!forParent && numChildren > 1)) {
    assertDeleteChildIsEnabled();
  } else {
    assertDeleteChildIsDisabled();
  }

  return { store, parent, childrenInfos };
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

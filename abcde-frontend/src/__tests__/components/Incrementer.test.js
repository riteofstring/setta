import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import userEvent from "@testing-library/user-event";
import { addSectionInfo, getStoreProviderWrapper } from "__tests__utils/utils";
import { createStore } from "__tests__utils/utils";
import { SectionHeader } from "components/UI/Section/SectionContainer/Header/SectionHeader";
import { useAddChild, useDeleteChild } from "hooks/useAddDeleteChild";
import _ from "lodash";
import { act } from "react-dom/test-utils";

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

test.each([false, true])(
  "Incrementer: delete self, forParent=%s",
  (forParent) => {
    const { store, parent, childIds } = componentSetup({
      forParent,
      numChildren: 1,
    });
    clickDeleteSelf(store, parent, childIds[0], forParent);
  }
);

test("Incrementer: click add child N times ", () => {
  const { store, parent } = componentSetup({ forParent: true, numChildren: 1 });
  clickAddChildNTimes(store, parent, 1, 5);
});

test("Incrementer: click add N children ", () => {
  const { store, parent } = componentSetup({ forParent: true, numChildren: 1 });
  clickAddNChildren(store, parent, 1, 5);
});

test("Incrementer: click delete child N times", () => {
  const { store, parent } = componentSetup({
    forParent: true,
    numChildren: 4,
  });
  clickDeleteChildNTimes(store, parent, 4, 4);
});

test("Incrementer: click delete N children", () => {
  const { store, parent } = componentSetup({
    forParent: true,
    numChildren: 4,
  });
  clickDeleteNChildren(store, parent, 4, 4);
});

function componentSetup({ forParent, numChildren }) {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const parent = addSectionInfo(store);
  let { result } = renderHook(() => useAddChild(parent.id), { wrapper });
  _.range(numChildren).forEach(() => {
    act(() => result.current({}));
  });
  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[parent.id];
  const childIds = state.childrenInfo[childrenInfoId];

  // increment for one of the children
  function SectionHeaderForChild() {
    return (
      <SectionHeader
        parentId={parent.id}
        sectionId={childIds[0].id}
        nextId={childIds.length > 1 ? childIds[1].id : null}
        isList={true}
        isListRoot={false}
      />
    );
  }

  // increment for one of the children
  function SectionHeaderForParent() {
    const addChild = useAddChild(parent.id);
    const deleteChild = useDeleteChild(parent.id);
    return (
      <SectionHeader
        sectionId={parent.id}
        isList={false}
        isListRoot={true}
        addChild={addChild}
        deleteChild={deleteChild}
        hasNested={true}
      />
    );
  }

  render(forParent ? <SectionHeaderForParent /> : <SectionHeaderForChild />, {
    wrapper,
  });

  if ((forParent && numChildren > 0) || (!forParent && numChildren > 1)) {
    assertDeleteChildIsEnabled();
  } else {
    assertDeleteChildIsDisabled();
  }

  return { store, parent, childIds };
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

function assertNChildrenDeleted(store, parent, numInitialChildren, N) {
  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[parent.id];

  // parent plus children
  expect(_.size(state.x)).toEqual(1 + numInitialChildren - N);
  // 1 parent so only 1 entry in idsOverview
  expect(_.size(state.idsOverview)).toEqual(1);
  expect(childrenInfoId).toBeTruthy();
  expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(
    numInitialChildren - N
  );
}

async function clickIncrementerNTimes({
  store,
  parent,
  numInitialChildren,
  N,
  buttonName,
  assertionFn,
}) {
  for (let x of _.range(N)) {
    const addChildButton = screen.getByRole("button", {
      name: buttonName,
    });
    await userEvent.click(addChildButton);
    assertionFn(store, parent, numInitialChildren, x + 1);
  }
}

async function enterNClickOnce({
  store,
  parent,
  numInitialChildren,
  N,
  buttonName,
  assertionFn,
}) {
  const numSectionsInput = screen.getByRole("textbox", {
    name: "Number of sections",
  });
  const addChildButton = screen.getByRole("button", {
    name: buttonName,
  });
  await userEvent.clear(numSectionsInput);
  await userEvent.type(numSectionsInput, N.toString());
  await userEvent.click(addChildButton);
  assertionFn(store, parent, numInitialChildren, N);
}

function clickAddChildNTimes(store, parent, numInitialChildren, N) {
  clickIncrementerNTimes({
    store,
    parent,
    numInitialChildren,
    N,
    buttonName: "Add child section",
    assertionFn: assertNChildrenAdded,
  });
}

function clickAddNChildren(store, parent, numInitialChildren, N) {
  enterNClickOnce({
    store,
    parent,
    numInitialChildren,
    N,
    buttonName: "Add child section",
    assertionFn: assertNChildrenAdded,
  });
}

function clickDeleteChildNTimes(store, parent, numInitialChildren, N) {
  clickIncrementerNTimes({
    store,
    parent,
    numInitialChildren,
    N,
    buttonName: "Delete child section",
    assertionFn: assertNChildrenDeleted,
  });
}

function clickDeleteNChildren(store, parent, numInitialChildren, N) {
  enterNClickOnce({
    store,
    parent,
    numInitialChildren,
    N,
    buttonName: "Delete child section",
    assertionFn: assertNChildrenDeleted,
  });
}

async function clickDeleteSelf(store, parent, childId, forParent) {
  const deleteSelf = screen.getByRole("button", {
    name: "Delete self",
  });
  await userEvent.click(deleteSelf);

  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[parent.id];

  const xSize = forParent ? 0 : 1;
  expect(_.size(state.x)).toEqual(xSize);
  expect(_.size(state.childrenInfo[childrenInfoId])).toEqual(0);
  expect(state.x[childId]).toBeUndefined();

  if (forParent) {
    expect(state.x[parent.id]).toBeUndefined();
  }
}

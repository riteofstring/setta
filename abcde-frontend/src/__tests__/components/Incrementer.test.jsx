import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionHeader } from "components/UI/Section/SectionContainer/Header/SectionHeader";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { resetAllSlices } from "models/utils";
import { addChild } from "thunks/addChild";
import { addSectionInfo } from "__tests__utils/utils";

test("Incrementer: click add sibling N times", async () => {
  const { parent } = componentSetup({
    forParent: false,
    numChildren: 1,
  });
  await clickAddChildNTimes(parent, 1, 5);
});

test("Incrementer: click add N siblings", async () => {
  const { parent } = componentSetup({
    forParent: false,
    numChildren: 1,
  });
  await clickAddNChildren(parent, 1, 5);
});

test.each([false, true])(
  "Incrementer: delete self, forParent=%s",
  async (forParent) => {
    const { parent, childIds } = componentSetup({
      forParent,
      numChildren: 1,
    });
    await clickDeleteSelf(parent, childIds[0], forParent);
  }
);

test("Incrementer: click add child N times ", async () => {
  const { parent } = componentSetup({ forParent: true, numChildren: 1 });
  await clickAddChildNTimes(parent, 1, 5);
});

test("Incrementer: click add N children ", async () => {
  const { parent } = componentSetup({ forParent: true, numChildren: 1 });
  await clickAddNChildren(parent, 1, 5);
});

test("Incrementer: click delete child N times", async () => {
  const { parent } = componentSetup({
    forParent: true,
    numChildren: 4,
  });
  await clickDeleteChildNTimes(parent, 4, 4);
});

test("Incrementer: click delete N children", async () => {
  const { parent } = componentSetup({
    forParent: true,
    numChildren: 4,
  });
  await clickDeleteNChildren(parent, 4, 4);
});

function componentSetup({ forParent, numChildren }) {
  resetAllSlices();
  const { section: parent } = addSectionInfo();
  _.range(numChildren).forEach(() => {
    addChild({ parentId: parent.id });
  });
  const state = useSectionInfos.getState();
  const childIds = state.allChildren[parent.id];

  // increment for one of the children
  function SectionHeaderForChild() {
    return (
      <SectionHeader
        parentId={parent.id}
        sectionId={childIds[0]}
        nextId={childIds.length > 1 ? childIds[1] : null}
        isSeriesElement={true}
        isRoot={false}
      />
    );
  }

  // increment for one of the children
  function SectionHeaderForParent() {
    return (
      <SectionHeader
        sectionId={parent.id}
        isSeriesElement={false}
        isRoot={true}
        hasNested={true}
      />
    );
  }

  render(forParent ? <SectionHeaderForParent /> : <SectionHeaderForChild />);

  if ((forParent && numChildren > 0) || (!forParent && numChildren > 1)) {
    assertDeleteChildIsEnabled();
  } else {
    assertDeleteChildIsDisabled();
  }

  return { parent, childIds };
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

function assertNChildrenAdded(parent, numInitialChildren, N) {
  const state = useSectionInfos.getState();

  // parent plus children
  expect(_.size(state.x)).toEqual(1 + numInitialChildren + N);
  // 1 parent so only 1 entry in allChildren
  expect(_.size(state.allChildren)).toEqual(1);
  expect(_.size(state.allChildren[parent.id])).toEqual(numInitialChildren + N);
}

function assertNChildrenDeleted(parent, numInitialChildren, N) {
  const state = useSectionInfos.getState();

  // parent plus children
  expect(_.size(state.x)).toEqual(1 + numInitialChildren - N);
  // 1 parent so only 1 entry in allChildren
  expect(_.size(state.allChildren)).toEqual(1);
  expect(_.size(state.allChildren[parent.id])).toEqual(numInitialChildren - N);
}

async function clickIncrementerNTimes({
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
    assertionFn(parent, numInitialChildren, x + 1);
  }
}

async function enterNClickOnce({
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
  assertionFn(parent, numInitialChildren, N);
}

async function clickAddChildNTimes(parent, numInitialChildren, N) {
  await clickIncrementerNTimes({
    parent,
    numInitialChildren,
    N,
    buttonName: "Add child section",
    assertionFn: assertNChildrenAdded,
  });
}

async function clickAddNChildren(parent, numInitialChildren, N) {
  await enterNClickOnce({
    parent,
    numInitialChildren,
    N,
    buttonName: "Add child section",
    assertionFn: assertNChildrenAdded,
  });
}

async function clickDeleteChildNTimes(parent, numInitialChildren, N) {
  await clickIncrementerNTimes({
    parent,
    numInitialChildren,
    N,
    buttonName: "Delete child section",
    assertionFn: assertNChildrenDeleted,
  });
}

async function clickDeleteNChildren(parent, numInitialChildren, N) {
  await enterNClickOnce({
    parent,
    numInitialChildren,
    N,
    buttonName: "Delete child section",
    assertionFn: assertNChildrenDeleted,
  });
}

async function clickDeleteSelf(parent, childId, forParent) {
  const deleteSelf = screen.getByRole("button", {
    name: "Delete self",
  });
  await userEvent.click(deleteSelf);

  const state = useSectionInfos.getState();

  const xSize = forParent ? 0 : 1;
  expect(_.size(state.x)).toEqual(xSize);
  expect(_.size(state.allChildren[parent.id])).toEqual(0);
  expect(state.x[childId]).toBeUndefined();

  if (forParent) {
    expect(state.x[parent.id]).toBeUndefined();
  }
}

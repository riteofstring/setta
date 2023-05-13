import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SectionHeader } from "components/UI/Section/SectionContainer/Header/SectionHeader";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { addChildForSeries } from "thunks/sections/addChild";
import { createDefaultSectionInfo } from "thunks/sections/createSectionInfo";
import { loadTestDataIntoState, ResizeObserver } from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

describe("Incrementer", () => {
  beforeAll(async () => {
    await loadTestDataIntoState({ sections: {}, sectionChildren: {} });
  });

  afterEach(() => {
    cleanup(); //get rid of rendered components
    useSectionInfos
      .getState()
      .resetAndSetAll({ sections: {}, sectionChildren: {} });
  });

  test("Adding sibling N times", async () => {
    const { parentId } = await componentSetup({
      forParent: false,
      numChildren: 1,
    });
    await clickAddChildNTimes(parentId, 1, 5);
  });

  test("Clicking add-N siblings", async () => {
    const { parentId } = await componentSetup({
      forParent: false,
      numChildren: 1,
    });
    await clickAddNChildren(parentId, 1, 5);
  });

  test.each([false, true])("Deleting self, forParent=%s", async (forParent) => {
    const { parentId, childIds } = await componentSetup({
      forParent,
      numChildren: 1,
    });
    await clickDeleteSelf(parentId, childIds[0], forParent);
  });

  test("Clicking add child N times ", async () => {
    const { parentId } = await componentSetup({
      forParent: true,
      numChildren: 1,
    });
    await clickAddChildNTimes(parentId, 1, 5);
  });

  test("Clicking add N children ", async () => {
    const { parentId } = await componentSetup({
      forParent: true,
      numChildren: 1,
    });
    await clickAddNChildren(parentId, 1, 5);
  });

  test("Clicking delete child N times", async () => {
    const { parentId } = await componentSetup({
      forParent: true,
      numChildren: 4,
    });
    await clickDeleteChildNTimes(parentId, 4, 4);
  });

  test("Clicking delete N children", async () => {
    const { parentId } = await componentSetup({
      forParent: true,
      numChildren: 4,
    });
    await clickDeleteNChildren(parentId, 4, 4);
  });
});

async function componentSetup({ forParent, numChildren }) {
  const parentId = createDefaultSectionInfo({})[0];
  addChildForSeries({ parentId, numChildren });
  const childIds = useSectionInfos.getState().allChildren[parentId];

  // increment for one of the children
  function SectionHeaderForChild() {
    const sectionExists = useSectionInfos((x) => x.x[childIds[0]]);
    return (
      sectionExists && (
        <SectionHeader
          parentId={parentId}
          sectionId={childIds[0]}
          nextId={childIds.length > 1 ? childIds[1] : null}
          isSeriesElement={true}
          isRoot={false}
        />
      )
    );
  }

  // increment for one of the children
  function SectionHeaderForParent() {
    const sectionExists = useSectionInfos((x) => x.x[parentId]);
    return (
      sectionExists && (
        <SectionHeader
          sectionId={parentId}
          isSeriesElement={false}
          isRoot={true}
          hasNested={true}
        />
      )
    );
  }

  render(forParent ? <SectionHeaderForParent /> : <SectionHeaderForChild />);

  if ((forParent && numChildren > 0) || (!forParent && numChildren > 1)) {
    assertDeleteChildIsEnabled();
  } else {
    assertDeleteChildIsDisabled();
  }

  return { parentId, childIds };
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

function assertNChildrenAdded(parentId, numInitialChildren, N) {
  const state = useSectionInfos.getState();

  // parentId plus children
  expect(_.size(state.x)).toEqual(1 + numInitialChildren + N);
  // every section gets an entry in allChildren, so parentId plus children
  expect(_.size(state.allChildren)).toEqual(1 + numInitialChildren + N);
  expect(_.size(state.allChildren[parentId])).toEqual(numInitialChildren + N);
}

function assertNChildrenDeleted(parentId, numInitialChildren, N) {
  const state = useSectionInfos.getState();
  // parentId plus children
  expect(_.size(state.x)).toEqual(1 + numInitialChildren - N);
  // every section gets an entry in allChildren, so parentId plus children
  expect(_.size(state.allChildren)).toEqual(1 + numInitialChildren - N);
  expect(_.size(state.allChildren[parentId])).toEqual(numInitialChildren - N);
}

async function clickIncrementerNTimes({
  parentId,
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
    assertionFn(parentId, numInitialChildren, x + 1);
  }
}

async function enterNClickOnce({
  parentId,
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
  assertionFn(parentId, numInitialChildren, N);
}

async function clickAddChildNTimes(parentId, numInitialChildren, N) {
  await clickIncrementerNTimes({
    parentId,
    numInitialChildren,
    N,
    buttonName: "Add child section",
    assertionFn: assertNChildrenAdded,
  });
}

async function clickAddNChildren(parentId, numInitialChildren, N) {
  await enterNClickOnce({
    parentId,
    numInitialChildren,
    N,
    buttonName: "Add child section",
    assertionFn: assertNChildrenAdded,
  });
}

async function clickDeleteChildNTimes(parentId, numInitialChildren, N) {
  await clickIncrementerNTimes({
    parentId,
    numInitialChildren,
    N,
    buttonName: "Delete child section",
    assertionFn: assertNChildrenDeleted,
  });
}

async function clickDeleteNChildren(parentId, numInitialChildren, N) {
  await enterNClickOnce({
    parentId,
    numInitialChildren,
    N,
    buttonName: "Delete child section",
    assertionFn: assertNChildrenDeleted,
  });
}

async function clickDeleteSelf(parentId, childId, forParent) {
  const deleteSelf = screen.getByRole("button", {
    name: "Delete self",
  });
  await userEvent.click(deleteSelf);

  const state = useSectionInfos.getState();

  const xSize = forParent ? 0 : 1;
  expect(_.size(state.x)).toEqual(xSize);
  expect(_.size(state.allChildren[parentId])).toEqual(0);
  expect(state.x[childId]).toBeUndefined();

  if (forParent) {
    expect(state.x[parentId]).toBeUndefined();
  }
}

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMainContainer } from "__tests__utils/createMainContainer";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import { sectionIdFromName } from "__tests__utils/utils";

global.ResizeObserver = ResizeObserver;

test("Deleting a section should work", async () => {
  const { store } = await createMainContainer();
  const sectionName = "TransformNum2";
  const sectionId = sectionIdFromName(store, sectionName);
  const sectionInfosState = store.getState().sectionInfos;
  expect(sectionInfosState.x[sectionId]).toBeTruthy();
  expect(sectionInfosState.allChildren[sectionId]).toBeTruthy();
  expect(sectionInfosState.currChildren[sectionId]).toBeTruthy();

  const section = screen.getByTestId(`Delete ${sectionId}`);
  await userEvent.click(section);
  expect(sectionInfosState.x[sectionId]).toBeFalsy();
  expect(sectionInfosState.allChildren[sectionId]).toBeFalsy();
  expect(sectionInfosState.currChildren[sectionId]).toBeFalsy();
});

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSectionInfos } from "models/info/sectionInfos";
import { createMainContainer } from "__tests__utils/createMainContainer";
import { sectionIdFromName } from "__tests__utils/utils";

test("Deleting a section should work", async () => {
  await createMainContainer();
  const sectionName = "TransformNum2";
  const sectionId = sectionIdFromName(sectionName);
  let sectionInfosState = useSectionInfos.getState();
  expect(sectionInfosState.x[sectionId]).toBeTruthy();
  expect(sectionInfosState.allChildren[sectionId]).toBeTruthy();
  expect(sectionInfosState.currChildren[sectionId]).toBeTruthy();

  const deleteButton = screen.getByTestId(`Delete ${sectionId}`);
  await userEvent.click(deleteButton);
  sectionInfosState = useSectionInfos.getState();
  expect(sectionInfosState.x[sectionId]).toBeFalsy();
  expect(sectionInfosState.allChildren[sectionId]).toBeFalsy();
  expect(sectionInfosState.currChildren[sectionId]).toBeFalsy();
});

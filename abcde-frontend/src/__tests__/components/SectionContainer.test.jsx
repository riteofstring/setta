import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SECTION } from "utils/constants";
import { createMainContainer } from "__tests__utils/createMainContainer";
import {
  renderUseGetParamChildId,
  renderUseGetParamUIType,
} from "__tests__utils/renderHooks";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import { getParameterToTestOn, sectionIdFromName } from "__tests__utils/utils";

global.ResizeObserver = ResizeObserver;

test("A nested section should appear when a parameter uitype becomes section", async () => {
  const { store, wrapper } = await createMainContainer();
  const sectionName = "The2ndOtherParameters";
  const sectionId = sectionIdFromName(store, sectionName);

  const {
    paramInfo: { id: paramInfoId },
  } = getParameterToTestOn(store, wrapper, sectionName, "dataset_root");

  let { result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper);
  expect(result.current).toEqual(null);

  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));

  // make section active
  const section = screen.getByTestId(`${sectionId} section core`);
  await userEvent.click(section);

  // go to the parameter config pane
  const parameterPaneButton = screen.getByTestId("UiEditor Parameters Button");
  await userEvent.click(parameterPaneButton);

  // set the parameter to be an object
  const uiElement = screen.getByTestId("UIElement dataset_root");
  const inputFields = within(uiElement).getAllByRole("textbox", {
    hidden: true,
  });
  const combobox = inputFields[0]; //combobox is the first textbox within uiElement
  await userEvent.clear(combobox);
  await userEvent.type(combobox, "Object");
  await userEvent.type(combobox, "{arrowdown}");
  await userEvent.tab();

  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current.type).toEqual(SECTION);
  expect(result.current.presetType).toEqual("base");

  ({ result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper));
  expect(result.current).toBeTruthy();
  const childId = result.current;
  const nestedSection = screen.getByTestId(`${childId} section core`);
  expect(nestedSection).toBeTruthy();
});

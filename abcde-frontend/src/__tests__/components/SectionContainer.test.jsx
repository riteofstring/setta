import { render, screen, waitFor } from "@testing-library/react";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { SECTION } from "utils/constants";
import {
  createStoreWrapperWithData,
  getParameterToTestOn,
  getUITypeByName,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseGetParamChildId,
  renderUseGetParamUIType,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import { sectionIdFromName } from "__tests__utils/utils";

global.ResizeObserver = ResizeObserver;

test("A nested section should appear when a parameter uitype becomes section", async () => {
  const { store, wrapper } = await createStoreWrapperWithData();
  const sectionName = "The2ndOtherParameters";
  const sectionId = sectionIdFromName(store, sectionName);
  const props = { sectionId, parentId: null, depth: 0 };
  const { rerender } = render(<MainContainer {...props} />, { wrapper });

  const {
    paramInfo: { id: paramInfoId },
  } = getParameterToTestOn(store, wrapper, sectionName, "dataset_root");

  let { result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper);
  expect(result.current).toEqual(null);

  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));

  const hookProps = {
    sectionId,
    paramInfoId,
    currUIType: result.current,
  };
  ({ result } = renderUseSetUIType(hookProps, wrapper));

  const newUIType = getUITypeByName(store, "", SECTION, true);
  waitFor(() => result.current[0](newUIType.id));

  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current).toEqual(newUIType);

  rerender(<MainContainer {...props} />, { wrapper });

  ({ result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper));
  expect(result.current).toBeTruthy();
  const childId = result.current;

  const nestedSection = screen.getByTestId(`${childId} section core`);
  expect(nestedSection).toBeTruthy();
});

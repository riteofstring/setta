import { render, screen, waitFor } from "@testing-library/react";
import SectionContainer from "components/UI/Section/SectionContainer/SectionContainer";
import { SECTION } from "utils/constants";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
  getUITypeByName,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseGetParamChildId,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";
import { sectionIdFromName } from "__tests__utils/utils";

test("A nested section should appear when a parameter uitype becomes section", async () => {
  const { store, wrapper } = createStoreWrapperWithData();
  const sectionName = "The2ndOtherParameters";
  const sectionId = sectionIdFromName(store, sectionName);
  const props = { sectionId, parentId: null, depth: 0 };
  render(<SectionContainer {...props} />, { wrapper });

  const {
    paramInfo: { id: paramInfoId },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(
    store,
    wrapper,
    sectionName,
    "dataset_root"
  );

  let { result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper);
  expect(result.current).toEqual(null);

  const hookProps = {
    sectionId,
    paramInfoId,
    currUIType: initialUIType,
  };
  ({ result } = renderUseSetUIType(hookProps, wrapper));

  const newUIType = getUITypeByName(store, "", SECTION, true);
  waitFor(() => result.current[0](newUIType.id));

  ({ result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper));
  expect(result.current).toBeTruthy();
  const childId = result.current;

  const nestedSection = screen.getByTestId(`${childId} section core`);
  expect(nestedSection).toBeTruthy();
});

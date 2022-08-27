import { act } from "react-dom/test-utils";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
} from "__tests__utils/createStoreWrapperWithData";
import { renderUseParamEnteredValue } from "__tests__utils/renderHooks";

test("Test JSON generation", () => {
  singleParameter();
});

function singleParameter() {
  const { store, wrapper } = createStoreWrapperWithData();
  let result = null;

  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId },
  } = getParameterToTestOnAndInitialUIType(
    store,
    wrapper,
    "X",
    "birth_location"
  );

  ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
  act(() => result.current[1](51));

  const selected = store.getActions().master.exportSelected();

  expect(selected).toEqual({
    "V~Model": {},
    "V~Optimizer": {},
    "V~Transform": {},
    "V~TrainDataset": {},
    "V~ValDataset": {},
    "V~OtherParameters": {},
    "V~The2ndOtherParameters": {},
    "V~X": { "P~birth_location": 51 },
  });
}

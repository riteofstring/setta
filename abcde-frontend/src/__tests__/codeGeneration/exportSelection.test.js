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

  const commonOutput = {
    "V~Model": {},
    "V~Optimizer": {},
    "V~Transform": {},
    "V~TrainDataset": {},
    "V~ValDataset": {},
    "V~OtherParameters": {},
    "V~The2ndOtherParameters": {},
  };

  for (let value of ["51", 51, true, false]) {
    ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
    act(() => result.current[1](value));

    const selected = store.getActions().master.exportSelected();
    const correct = value === "51" ? "S~51" : value;
    expect(selected).toEqual({
      ...commonOutput,
      "V~X": { "P~birth_location": correct },
    });
  }
}

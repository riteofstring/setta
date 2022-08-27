import { act } from "react-dom/test-utils";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  createDeck,
  moveSectionIntoDeck,
} from "__tests__utils/moveSectionIntoDeck";
import { renderUseParamEnteredValue } from "__tests__utils/renderHooks";

test.each([false, true])("Single entered value", (isInDeck) => {
  singleParameter(isInDeck);
});

test.each([false, true])("Multiple entered values", (isInDeck) => {
  multipleParameters(isInDeck);
});

function singleParameter(isInDeck) {
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

  if (isInDeck) {
    const deckId = createDeck(wrapper, "Deck");
    moveSectionIntoDeck(store, wrapper, sectionId, deckId);
  }

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

function multipleParameters(isInDeck) {
  const { store, wrapper } = createStoreWrapperWithData();
  let result = null;

  const enteredValues = [true, "dogs", 51, false, "36"];
  let idx = 0;
  for (let x of testSectionNamesParamNames({})) {
    const {
      sectionInfo: { id: sectionId },
      paramInfo: { id: paramInfoId },
    } = getParameterToTestOnAndInitialUIType(
      store,
      wrapper,
      x.sectionName,
      x.paramName
    );

    if (isInDeck) {
      const deckId = createDeck(wrapper, "Deck");
      moveSectionIntoDeck(store, wrapper, sectionId, deckId);
    }

    ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
    act(() => result.current[1](enteredValues[idx]));
    idx += 1;
  }

  const selected = store.getActions().master.exportSelected();
  expect(selected).toEqual({
    "V~Model": {},
    "V~Optimizer": {},
    "V~Transform": {},
    "V~TrainDataset": {},
    "V~ValDataset": {},
    "V~OtherParameters": {
      "P~dataset_root": true,
      "P~batch_size": "S~dogs",
      "P~test_batch_size": 51,
      "P~epochs": false,
    },
    "V~The2ndOtherParameters": {},
    "V~X": { "P~birth_location": "S~36" },
  });
}

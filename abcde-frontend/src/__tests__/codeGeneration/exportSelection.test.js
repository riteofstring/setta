import _ from "lodash";
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

test.each(testCases())("Single entered value", (depth) => {
  singleParameter(depth);
});

test.each(testCases())("Multiple entered values", (depth) => {
  multipleParameters(depth);
});

function testCases() {
  const output = [];
  // depth is how many decks deep the parameters will be nested
  for (let depth of _.range(5)) {
    output.push(depth);
  }
  return output;
}

function singleParameter(depth) {
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

  // put a deck within a deck within a deck ...
  recursivelyAddDeckWithinDeck(store, wrapper, [sectionId], depth);

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

function multipleParameters(depth) {
  const { store, wrapper } = createStoreWrapperWithData();
  let result = null;

  const sectionIds = [];
  const paramInfoIds = [];
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
    sectionIds.push(sectionId);
    paramInfoIds.push(paramInfoId);
  }
  recursivelyAddDeckWithinDeck(store, wrapper, _.uniq(sectionIds), depth);

  const enteredValues = [true, "dogs", 51, false, "36"];
  let idx = 0;
  for (let x of _.zip(sectionIds, paramInfoIds)) {
    ({ result } = renderUseParamEnteredValue(x[0], x[1], wrapper));
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

function recursivelyAddDeckWithinDeck(store, wrapper, sectionIds, depth) {
  // put a deck within a deck within a deck ...
  let currIds = sectionIds;
  _.range(depth).forEach(() => {
    let deckId = createDeck(wrapper, "Deck");
    moveSectionIntoDeck(store, wrapper, currIds, deckId);
    currIds = [deckId];
  });
}

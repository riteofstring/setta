import { waitFor } from "@testing-library/react";
import _ from "lodash";
import {
  listOfTransformsAsJson,
  selectComposeTransform,
} from "__tests__utils/addNestedListRoot";
import {
  callMoveChildThunk,
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  createDeck,
  moveSectionIntoDeck,
} from "__tests__utils/moveSectionIntoDeck";
import { renderUseParamEnteredValue } from "__tests__utils/renderHooks";

test.each(testCases())(
  "Single entered value",
  (numNestedDecks, numTransforms, putDeckInTransforms) => {
    // TODO: uncomment
    // singleParameter(numNestedDecks, numTransforms, putDeckInTransforms);
  }
);

test.each(testCases())(
  "Multiple entered values",
  (numNestedDecks, numTransforms, putDeckInTransforms) => {
    // TODO: uncomment
    // multipleParameters(numNestedDecks, numTransforms, putDeckInTransforms);
  }
);

function testCases() {
  const output = [];
  // depth is how many decks deep the parameters will be nested
  for (let depth of _.range(4)) {
    for (let numTransforms of _.range(3)) {
      for (let putDeckInTransforms of [false, true]) {
        output.push([depth, numTransforms, putDeckInTransforms]);
      }
    }
  }
  return output;
}

async function singleParameter(
  numNestedDecks,
  numTransforms,
  putDeckInTransforms
) {
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
    "V~Transform": {
      "O~torchvision.transforms.Compose": {
        "P~transforms": listOfTransformsAsJson().slice(0, numTransforms),
      },
    },
    "V~TrainDataset": {},
    "V~ValDataset": {},
    "V~OtherParameters": {},
    "V~The2ndOtherParameters": {},
  };

  addToDeckAndMaybePutDeckInTransforms(
    store,
    wrapper,
    [sectionId],
    numNestedDecks,
    numTransforms,
    putDeckInTransforms
  );

  for (let value of ["51", 51, true, false]) {
    ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
    await waitFor(() => result.current[1](value));

    const selected = store.getActions().master.exportSelected();
    const correct = value === "51" ? "S~51" : value;
    const correctXSelection = { "V~X": { "P~birth_location": correct } };
    let correctTotalSelection = _.cloneDeep(commonOutput);
    if (putDeckInTransforms) {
      correctTotalSelection["V~Transform"]["O~torchvision.transforms.Compose"][
        "P~transforms"
      ].push(correctXSelection["V~X"]);
    } else {
      correctTotalSelection = {
        ...correctTotalSelection,
        ...correctXSelection,
      };
    }
    expect(selected).toEqual(correctTotalSelection);
  }
}

async function multipleParameters(
  numNestedDecks,
  numTransforms,
  putDeckInTransforms
) {
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
  addToDeckAndMaybePutDeckInTransforms(
    store,
    wrapper,
    sectionIds,
    numNestedDecks,
    numTransforms,
    putDeckInTransforms
  );

  const enteredValues = [true, "dogs", 51, false, "36"];
  let idx = 0;
  for (let x of _.zip(sectionIds, paramInfoIds)) {
    ({ result } = renderUseParamEnteredValue(x[0], x[1], wrapper));
    await waitFor(() => result.current[1](enteredValues[idx]));
    idx += 1;
  }

  const selected = store.getActions().master.exportSelected();
  let commonOutput = {
    "V~Model": {},
    "V~Optimizer": {},
    "V~Transform": {
      "O~torchvision.transforms.Compose": {
        "P~transforms": listOfTransformsAsJson().slice(0, numTransforms),
      },
    },
    "V~TrainDataset": {},
    "V~ValDataset": {},
    "V~The2ndOtherParameters": {},
  };

  const correctEntered = {
    "V~OtherParameters": {
      "P~dataset_root": true,
      "P~batch_size": "S~dogs",
      "P~test_batch_size": 51,
      "P~epochs": false,
    },
    "V~X": { "P~birth_location": "S~36" },
  };

  if (putDeckInTransforms) {
    commonOutput["V~Transform"]["O~torchvision.transforms.Compose"][
      "P~transforms"
    ].push(...Object.values(correctEntered));
  } else {
    commonOutput = {
      ...commonOutput,
      ...correctEntered,
    };
  }
  expect(selected).toEqual(commonOutput);
}

function recursivelyAddDeckWithinDeck(store, wrapper, sectionIds, depth) {
  // put a deck within a deck within a deck ...
  let currIds = sectionIds;
  _.range(depth).forEach(() => {
    let deckId = createDeck(wrapper, "Deck");
    moveSectionIntoDeck(store, wrapper, currIds, deckId);
    currIds = [deckId];
  });
  // if depth is 0, then returned list is just sectionIds
  return currIds;
}

function addToDeckAndMaybePutDeckInTransforms(
  store,
  wrapper,
  sectionIds,
  numNestedDecks,
  numTransforms,
  putDeckInTransforms
) {
  // put a deck within a deck within a deck ...
  const deckIds = recursivelyAddDeckWithinDeck(
    store,
    wrapper,
    _.uniq(sectionIds),
    numNestedDecks
  );
  const { listRootId } = selectComposeTransform(store, wrapper, numTransforms);

  if (putDeckInTransforms) {
    // move child to the pane (top-level)
    for (let i = 0; i < deckIds.length; i++) {
      callMoveChildThunk(store, wrapper, {
        newParentId: listRootId,
        childId: deckIds[i],
        newIndex: numTransforms + i, //put deck at end of list
      });
    }
  }
}

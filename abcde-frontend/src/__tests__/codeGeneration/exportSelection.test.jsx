import { render } from "@testing-library/react";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

test("export simpleTrainTest", async () => await testExport());

async function testExport() {
  const { store, wrapper } = await createStoreWrapperWithData();
  render(<MainContainer />, {
    wrapper,
  });
  const selected = store.getActions().master.exportSelected();
  const correct = {
    "V~Model": {
      "O~torchvision.models.resnet152": {
        "P~num_layers": "S~13",
      },
    },
    "V~Optimizer": {},
    "V~Transform": {},
    "V~TrainDataset": {},
    "V~ValDataset": {},
    "V~OtherParameters": {
      "P~dataset_root": "S~70",
      "P~dog_power": "S~9000",
    },
    "V~The2ndOtherParameters": {},
    "V~X": {
      "P~birth_details": {},
    },
    "V~TransformNum2": {
      "O~torchvision.transforms.Compose": {
        "P~transforms": [
          {
            "O~torchvision.transforms.AutoAugment": {
              "P~color": "S~red",
              "P~transparency": "S~true",
            },
          },
        ],
      },
    },
  };
  expect(selected).toEqual(correct);
}

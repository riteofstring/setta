import { loadGlobalCodeInfo } from "abcde-test/src/loaders/helpers";
import {
  findAllCallables,
  findAllParameters,
} from "abcde-utils/src/getDescendants";
import _ from "lodash";

describe("find descendants", () => {
  let codeInfo;
  beforeAll(async () => {
    codeInfo = await loadGlobalCodeInfo();
  });

  test("find all callable descendants", async () => {
    const collectionId = _.find(
      codeInfo,
      (x) => x.name === "The Best Optimizers"
    ).id;
    const callables = findAllCallables(codeInfo, [collectionId]);
    expect(new Set(callables.map((x) => x.name))).toEqual(
      new Set(["torch.optim.SGD", "torch.optim.Adam", "torch.optim.Adadelta"])
    );
  });

  test("find all parameter descendants", async () => {
    const objId = _.find(codeInfo, (x) => x.name === "torchvision.models.resnet101").id;
    const parameters = findAllParameters(codeInfo, [objId]);
    expect(new Set(parameters.map((x) => x.name))).toEqual(
      new Set(["pretrained", "progress"])
    );
  });
});

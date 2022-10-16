import { findAllCallables, findAllParameters } from "classes/infoFactory";
import _ from "lodash";
import { loadTestData } from "__tests__utils/loadTestData";

test("find all callable descendants", async () => {
  const { codeInfo } = await loadTestData();
  const collectionId = _.filter(
    codeInfo,
    (x) => x.name === "The Best Optimizers"
  )[0].id;
  const callables = findAllCallables(codeInfo, [collectionId]);
  expect(new Set(callables.map((x) => x.name))).toEqual(
    new Set(["SGD", "Adam", "Adadelta"])
  );
});

test("find all parameter descendants", async () => {
  const { codeInfo } = await loadTestData();
  const objId = _.filter(codeInfo, (x) => x.name === "resnet101")[0].id;
  const parameters = findAllParameters(codeInfo, [objId]);
  expect(new Set(parameters.map((x) => x.name))).toEqual(
    new Set(["pretrained", "progress", "kwargs"])
  );
});

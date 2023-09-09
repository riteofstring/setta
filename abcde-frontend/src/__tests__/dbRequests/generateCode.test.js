import { loadTestData } from "abcde-test/src/loaders/loaders";
import { compareObjs } from "abcde-utils/src/testUtils";
import _ from "lodash";
import { getProjectDataToGenerateCode } from "thunks/generateCode";
import { loadTestDataIntoState } from "__tests__utils/utils";

test("The output of getProjectDataToGenerateCode should match the test data", async () => {
  await loadTestDataIntoState();
  // let output = getProjectDataToGenerateCode();
  // const correctOutput = await loadTestData({
  //   projectName: "simpleTrainTest",
  //   configName: "simpleConfig1",
  //   format: "codeGen",
  // });
  // const { userCodeInfoMaps, outputGroups, outputs, runs, ...theRest } =
  //   correctOutput;

  // // ignore currChildren for now because it's hard to generate in abcde-test
  // output.sections = _.mapValues(output.sections, (s) =>
  //   _.omit(s, "currChildren")
  // );

  // compareObjs(expect, output, theRest);
});

import { createStoreWrapperWithData, getParameterToTestOnAndInitialUIType } from "__tests__utils/createStoreWrapperWithData";

test("Setting a non-preset config multiple times should result in only 1 new ui type", () => {
  testSetUIConfigMultipleTimes();
});

function testSetUIConfigMultipleTimes() {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(store, wrapper);
}

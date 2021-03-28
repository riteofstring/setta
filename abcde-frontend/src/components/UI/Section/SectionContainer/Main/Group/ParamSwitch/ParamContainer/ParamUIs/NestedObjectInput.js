export function NestedObjectInputConfig() {
  return ["modules"];
}

export function NestedObjectInputParseConfig(config) {
  if (config) {
    return ["torchvision_models", "my_models"]
    // const stringified = JSON.stringify(config);
    // console.log("stringified", stringified);
    // const output = JSON.parse(config["modules"]);
    // console.log("typeof", typeof output);
    // console.log("output[modules]", output["modules"])
    // if ("modules" in output && Array.isArray(output["modules"])) {
    //   return output["modules"];
    // }
  }
  return null;
}

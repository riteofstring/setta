import C from "constants/constants.json";

export function roundUpIdx(numList, x) {
  let closest = undefined;

  // Loop through each number in the list
  for (let num of numList) {
    if (num >= x) {
      // Check if the number is larger than x
      // If closest is not set or current number is closer to x than the current closest
      if (closest === undefined || num - x < closest - x) {
        closest = num;
      }
    }
  }

  return closest;
}

export function extractTemplateVarSuffix(str) {
  const suffixIdx = str.indexOf(
    C.TEMPLATE_PREFIX,
    str.indexOf(C.TEMPLATE_PREFIX) + 1,
  );
  return str.substring(suffixIdx);
}

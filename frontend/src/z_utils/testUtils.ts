export function compareObjs(expect, retrieved, correct) {
  expect(Object.keys(retrieved).sort()).toEqual(Object.keys(correct).sort());
  for (const k of Object.keys(retrieved)) {
    expect(retrieved[k], `${k} doesn't match`).toEqual(correct[k]);
  }
}

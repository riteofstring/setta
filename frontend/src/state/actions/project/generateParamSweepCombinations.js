export function* generateParamSweepCombinations(input) {
  // Helper generator function to yield combinations
  function* generateCombos(items, current = []) {
    if (items.length === 0) {
      yield current;
      return;
    }

    const item = items[0];
    const remainingItems = items.slice(1);

    // For each parameter in the current item
    for (const param of item.params) {
      // For each value in the parameter
      for (const value of param.values) {
        const combination = {
          paramSweepId: item.paramSweepId,
          selectedItem: item.selectedItem,
          paramInfoId: param.paramInfoId,
          value: value,
        };

        // Check if this combination is valid with the current set
        const isValid = current.every((existing) => {
          // Check rule: paramSweepId cannot appear with more than one selectedItem
          if (
            existing.paramSweepId === combination.paramSweepId &&
            existing.selectedItem !== combination.selectedItem
          ) {
            return false;
          }

          // Check rule: paramSweepId and selectedItem cannot appear with more than one paramInfoId
          if (
            existing.paramSweepId === combination.paramSweepId &&
            existing.selectedItem === combination.selectedItem &&
            existing.paramInfoId !== combination.paramInfoId
          ) {
            return false;
          }

          return true;
        });

        if (isValid) {
          yield* generateCombos(remainingItems, [...current, combination]);
        }
      }
    }
  }

  yield* generateCombos(input);
}

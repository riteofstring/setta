export function* generateParamSweepCombinations(input) {
  function* generateCombos(items, current = []) {
    if (items.length === 0) {
      yield current;
      return;
    }

    const item = items[0];
    const remainingItems = items.slice(1);

    if (item.params.length === 0) {
      yield* generateCombos(remainingItems, current);
      return;
    }

    const firstParamSet = [];

    // Generate all combinations for the first item's params
    for (const param of item.params) {
      for (const value of param.values) {
        const combination = {
          paramSweepId: item.paramSweepId,
          selectedItem: item.selectedItem,
          paramInfoId: param.paramInfoId,
          value: value,
        };

        // Check if this combination would create multiple selectedItems for the same paramSweepId
        const isValid = current.every((existing) => {
          if (
            existing.paramSweepId === combination.paramSweepId &&
            existing.selectedItem !== combination.selectedItem
          ) {
            return false;
          }
          return true;
        });

        // Check if this paramInfoId is already used in this combination set
        const paramInfoIdUsed = firstParamSet.some(
          (existing) => existing.paramInfoId === combination.paramInfoId,
        );

        if (isValid && !paramInfoIdUsed) {
          firstParamSet.push(combination);
        }
      }
    }

    // Generate all possible combinations of the params
    let paramCombinations = [[]];
    for (const param of item.params) {
      const newCombinations = [];
      for (const combo of paramCombinations) {
        for (const value of param.values) {
          newCombinations.push([
            ...combo,
            {
              paramSweepId: item.paramSweepId,
              selectedItem: item.selectedItem,
              paramInfoId: param.paramInfoId,
              value: value,
            },
          ]);
        }
      }
      paramCombinations = newCombinations;
    }

    // Yield each combination with the remaining items
    for (const combo of paramCombinations) {
      yield* generateCombos(remainingItems, [...current, ...combo]);
    }
  }

  yield* generateCombos(input);
}

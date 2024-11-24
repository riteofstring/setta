export function generateSectionParamSweepVersionCombinations(objects) {
  // Group objects by sectionId
  const sectionGroups = new Map();
  objects.forEach((obj) => {
    if (!sectionGroups.has(obj.sectionId)) {
      sectionGroups.set(obj.sectionId, []);
    }
    sectionGroups.get(obj.sectionId).push(obj);
  });

  // Get all root sections (sections that have at least one object with null parentVersionId)
  const rootSections = new Set();
  objects.forEach((obj) => {
    if (obj.parentVersionId === null) {
      rootSections.add(obj.sectionId);
    }
  });

  /**
   * Helper function to check if all required children are present
   */
  function hasRequiredChildren(combination, versionId) {
    const childrenNeeded = objects.filter(
      (obj) => obj.parentVersionId === versionId,
    );
    if (childrenNeeded.length === 0) return true;

    const childSections = new Set(childrenNeeded.map((obj) => obj.sectionId));
    const combinationSections = new Set(
      combination.map((obj) => obj.sectionId),
    );

    return Array.from(childSections).every((section) =>
      combinationSections.has(section),
    );
  }

  /**
   * Helper function to check if a combination is valid
   */
  function isValidCombination(combination) {
    // Check that all required children are present
    for (const obj of combination) {
      if (!hasRequiredChildren(combination, obj.versionId)) {
        return false;
      }
    }

    // Check that all parent requirements are met
    for (const obj of combination) {
      if (obj.parentVersionId !== null) {
        const hasParent = combination.some(
          (parent) => parent.versionId === obj.parentVersionId,
        );
        if (!hasParent) return false;
      }
    }

    return true;
  }

  /**
   * Helper function to generate combinations recursively
   */
  function generateCombinationsRecursive(sectionIds, currentCombination = []) {
    if (sectionIds.length === 0) {
      return isValidCombination(currentCombination) ? [currentCombination] : [];
    }

    const results = [];
    const currentSection = sectionIds[0];
    const remainingSections = sectionIds.slice(1);
    const options = sectionGroups.get(currentSection);

    for (const option of options) {
      const newCombination = [...currentCombination, option];
      const subCombinations = generateCombinationsRecursive(
        remainingSections,
        newCombination,
      );
      results.push(...subCombinations);
    }

    return results;
  }

  // Generate base combinations ensuring all root sections are included
  const rootSectionsArray = Array.from(rootSections);
  const combinations = generateCombinationsRecursive(rootSectionsArray);

  // Remove duplicates
  const uniqueCombinations = Array.from(
    new Set(combinations.map(JSON.stringify)),
  ).map(JSON.parse);

  return uniqueCombinations;
}

export function generateSectionParamSweepVersionCombinations(objects) {
  // Group objects by sectionId for quick lookup
  const sectionGroups = new Map();
  objects.forEach((obj) => {
    if (!sectionGroups.has(obj.sectionId)) {
      sectionGroups.set(obj.sectionId, []);
    }
    sectionGroups.get(obj.sectionId).push(obj);
  });

  // Get all root sections (sections that have at least one object with null parentVersionId)
  const rootSections = new Map();
  objects.forEach((obj) => {
    if (obj.parentVersionId === null) {
      if (!rootSections.has(obj.sectionId)) {
        rootSections.set(obj.sectionId, []);
      }
      rootSections.get(obj.sectionId).push(obj);
    }
  });

  // Create a map of versionId to its children objects
  const childrenMap = new Map();
  objects.forEach((obj) => {
    if (obj.parentVersionId !== null) {
      if (!childrenMap.has(obj.parentVersionId)) {
        childrenMap.set(obj.parentVersionId, []);
      }
      childrenMap.get(obj.parentVersionId).push(obj);
    }
  });

  /**
   * Helper function to get all required children for a combination
   */
  function getRequiredChildren(combination) {
    const required = new Set();
    combination.forEach((obj) => {
      const children = childrenMap.get(obj.versionId) || [];
      children.forEach((child) => {
        required.add(child);
      });
    });
    return Array.from(required);
  }

  /**
   * Helper function to check if a combination is valid
   */
  function isValidCombination(combination) {
    // Check for duplicate sectionIds
    const usedSections = new Set();
    for (const obj of combination) {
      if (usedSections.has(obj.sectionId)) return false;
      usedSections.add(obj.sectionId);
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

    // Check that all required children are included
    const requiredChildren = getRequiredChildren(combination);
    for (const required of requiredChildren) {
      const hasRequiredSection = combination.some(
        (obj) => obj.sectionId === required.sectionId,
      );
      if (!hasRequiredSection) return false;
    }

    // Check that all root sections are represented
    for (const [sectionId] of rootSections) {
      if (!combination.some((obj) => obj.sectionId === sectionId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Helper function to generate combinations recursively
   */
  function generateCombinationsRecursive(
    current = [],
    remainingSections = null,
  ) {
    // Initialize remainingSections on first call
    if (remainingSections === null) {
      remainingSections = new Set(objects.map((obj) => obj.sectionId));
    }

    // Base case: check if current combination is valid
    if (remainingSections.size === 0) {
      return isValidCombination(current) ? [current] : [];
    }

    const results = [];
    const sectionId = Array.from(remainingSections)[0];
    const newRemaining = new Set(remainingSections);
    newRemaining.delete(sectionId);

    // Get all possible objects for this section
    const options = sectionGroups.get(sectionId) || [];

    // Try each option for this section
    for (const option of options) {
      // Skip if this option's parent is not in the current combination
      if (option.parentVersionId !== null) {
        const hasParent = current.some(
          (obj) => obj.versionId === option.parentVersionId,
        );
        if (!hasParent) continue;
      }

      const newCombination = [...current, option];

      // Get any required children that aren't yet included
      const requiredChildren = getRequiredChildren([option]);
      const newSections = new Set();

      for (const child of requiredChildren) {
        if (
          !current.some((obj) => obj.sectionId === child.sectionId) &&
          !newRemaining.has(child.sectionId)
        ) {
          newSections.add(child.sectionId);
        }
      }

      // Add required children sections to remaining
      newSections.forEach((s) => newRemaining.add(s));

      // Recursively generate combinations
      const subCombinations = generateCombinationsRecursive(
        newCombination,
        newRemaining,
      );
      results.push(...subCombinations);
    }

    // Also try skipping this section if it's not required
    if (!rootSections.has(sectionId)) {
      results.push(...generateCombinationsRecursive(current, newRemaining));
    }

    return results;
  }

  // Generate combinations
  const combinations = generateCombinationsRecursive();

  // Remove duplicates
  const uniqueCombinations = Array.from(
    new Set(combinations.map(JSON.stringify)),
  ).map(JSON.parse);

  return uniqueCombinations;
}

export function getInfoToTemplateVarReferrer(state) {
  const output = {};
  for (const [variantId, variant] of Object.entries(state.variants)) {
    processTemplateVarForUpdater(variant.templateVars, output, { variantId });
  }
  return output;
}

function processTemplateVarForUpdater(templateVars, output, metadata) {
  for (const t of templateVars) {
    const { sectionId } = t;
    if (!sectionId) {
      return;
    }
    if (!(sectionId in output)) {
      output[sectionId] = [];
    }
    output[sectionId].push({
      originalTemplateVar: t,
      ...metadata,
    });
  }
}

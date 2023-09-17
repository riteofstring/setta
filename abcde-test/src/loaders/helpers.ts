export async function loadSpecificTestData({ name, projectName = "" }) {
  const ext = ".ts";

  try {
    const output = (
      await import(/* @vite-ignore */ `../data/${projectName}/${name}${ext}`)
    ).default;
    return output;
  } catch (e) {
    return {};
  }
}

export async function loadGlobalCodeInfo() {
  return await loadSpecificTestData({ name: "codeInfo" });
}

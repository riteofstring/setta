export function assertWorkspaceAccessPermissionContract(permission, context) {
  if (!permission) {
    throw new Error(`${context} lacks effective permission`);
  }
  const expected = {
    activePermissionProfileId: ":workspace",
    approvalPolicy: "never",
    builtIn: true,
    displayLabel: "Workspace Access",
    preset: "default",
  };
  for (const [field, value] of Object.entries(expected)) {
    if (permission[field] !== value) {
      throw new Error(
        `${context} has unexpected effective permission: ${JSON.stringify(permission)}`,
      );
    }
  }
}

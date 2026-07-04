export function assertAskForApprovalPermissionContract(permission, context) {
  if (!permission) {
    throw new Error(`${context} lacks effective permission`);
  }
  const expected = {
    activePermissionProfileId: ":workspace",
    approvalPolicy: "on-request",
    builtIn: true,
    displayLabel: "Ask for approval",
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

export function assertMoveToTrashTool(params) {
  const tools = params.dynamicTools;
  assertCondition(Array.isArray(tools), "thread/start missing dynamic tools");
  const moveToTrash = tools.find(isMoveToTrashTool);
  assertCondition(
    moveToTrash !== undefined,
    "thread/start missing visible setta.move_to_trash dynamic tool",
  );
  assertCondition(
    moveToTrash.deferLoading === undefined,
    "setta.move_to_trash must be immediately visible",
  );
  const schema = moveToTrash.inputSchema;
  assertCondition(schema.type === "object", "setta.move_to_trash must accept an object");
  assertCondition(
    schema.additionalProperties === false,
    "setta.move_to_trash must reject additional properties",
  );
  assertCondition(
    schema.properties.path.type === "string",
    "setta.move_to_trash path must be a string",
  );
  assertCondition(
    Array.isArray(schema.required) && schema.required.includes("path"),
    "setta.move_to_trash path must be required",
  );
}

function isMoveToTrashTool(tool) {
  return tool.namespace === "setta" && tool.name === "move_to_trash";
}

export function assertRepositoryScopedThreadParams(params, method) {
  assertCondition(params?.approvalPolicy === "never", `${method} must disable execution approvals`);
  if (params?.permissions === ":read-only") {
    assertCondition(
      params?.sandbox === undefined,
      `${method} cannot combine read-only permissions with sandbox`,
    );
    return;
  }
  assertCondition(
    params?.permissions === ":workspace",
    `${method} must enforce workspace permissions`,
  );
  assertCondition(
    params?.sandbox === undefined,
    `${method} cannot combine workspace permissions with sandbox`,
  );
}

export function assertRepositoryScopedTurnParams(params) {
  assertCondition(
    params?.approvalPolicy === "never",
    "turn/start must disable execution approvals",
  );
  const policy = params?.sandboxPolicy;
  if (policy?.type === "readOnly") {
    assertCondition(
      policy.networkAccess === false,
      "turn/start read-only policy must disable network access",
    );
    return;
  }
  assertCondition(policy?.type === "workspaceWrite", "turn/start must use workspace-write");
  assertCondition(policy.networkAccess === false, "turn/start must disable network access");
  assertCondition(policy.excludeSlashTmp === true, "turn/start must exclude /tmp writes");
  assertCondition(policy.excludeTmpdirEnvVar === true, "turn/start must exclude TMPDIR writes");
  assertCondition(
    Array.isArray(policy.writableRoots) && policy.writableRoots.length === 0,
    "turn/start must not add writable roots",
  );
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

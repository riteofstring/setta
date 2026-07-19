import { driverCallExpression } from "./cdp-client.mjs";
import { waitForState } from "./electron-cdp-harness.mjs";
import { assertDriverAction, conversationSurfaces } from "./topic-conversation-fork-workflow.mjs";
import { assertWorkingNow } from "./topic-conversation-now-highlight-assertions.mjs";

export async function submitDefaultApprovalLikeTurn({ client, conversationId, text, timeoutMs }) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text }),
    "submitted",
  );
  const complete = await waitForConversationSurface(client, conversationId, timeoutMs, (surface) =>
    [
      surface.state === "complete",
      surface.status === "completed",
      surface.approvalId === "",
      surface.summaryText !== "",
    ].every(Boolean),
  );
  assertWorkingNow(complete, "default yolo approval-like turn");
}

export async function configureConversationAgentApprovals(backend, workspaceId, conversationId) {
  const configuration = await backend.post("/conversations/roles/read", {
    conversationId,
    workspaceId,
  });
  const agent = configuration.profiles.find((profile) => profile.role === "agent");
  if (!agent) {
    throw new Error("conversation role configuration omitted agent");
  }
  const profile = JSON.parse(JSON.stringify(agent.effective));
  profile.permissionProfile = {
    ...profile.permissionProfile,
    approvalPolicy: "on-request",
    approvals: true,
    providerPermissionProfile: ":workspace",
  };
  const updated = await backend.post("/conversations/roles/update", {
    conversationId,
    updates: [{ profile, role: "agent" }],
    workspaceId,
  });
  assertConversationApprovalsEnabled(updated);
}

function assertConversationApprovalsEnabled(configuration) {
  const agent = configuration.profiles.find((profileConfig) => profileConfig.role === "agent");
  if (
    !agent ||
    agent.effective.permissionProfile.approvalPolicy !== "on-request" ||
    agent.effective.permissionProfile.approvals !== true ||
    agent.effective.permissionProfile.providerPermissionProfile !== ":workspace"
  ) {
    throw new Error(`failed to enable explicit approvals: ${JSON.stringify(configuration)}`);
  }
}

async function waitForConversationSurface(client, conversationId, timeoutMs, ready) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (candidate) => {
      const surface = conversationSurfaces(candidate.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    timeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

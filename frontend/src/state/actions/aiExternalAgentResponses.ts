import { res200 } from "utils/endpointUtils";
import {
  route_respond_external_agent_approval,
  route_respond_external_agent_question,
} from "utils/generatedEndpoints";

export async function respondExternalAgentApproval(
  approvalId: string,
  approved: boolean,
): Promise<boolean> {
  const res = await route_respond_external_agent_approval({
    approvalId,
    approved,
  });
  return res200(res);
}

export async function respondExternalAgentQuestion(
  toolCallId: string,
  answers: Record<string, string>,
): Promise<boolean> {
  const res = await route_respond_external_agent_question({
    toolCallId,
    answers,
  });
  return res200(res);
}

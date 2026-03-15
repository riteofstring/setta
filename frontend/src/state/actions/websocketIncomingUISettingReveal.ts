import {
  UISettingRevealContent,
  UISettingRevealContentSchema,
} from "utils/generatedTypes";
import { getCurrProjectConfigId } from "./sectionEffectiveImplSelectors";
import type { FrontendWebsocketMessageContext } from "./websocketIncomingTypes";
import {
  buildMalformedRevealStatuses,
  resolveRevealProjectConfigId,
  resolveRevealRequestId,
  sendUISettingRevealResult,
} from "./websocketIncomingUISettingRevealAck";
import {
  buildRevealExecutionContext,
  executeIncomingUISettingReveal,
} from "./websocketIncomingUISettingRevealExecution";

export async function handleIncomingUISettingRevealMessage(
  content: unknown,
  context: FrontendWebsocketMessageContext,
): Promise<void> {
  const fallbackProjectConfigId = getCurrProjectConfigId();
  const projectConfigId = resolveRevealProjectConfigId(
    content,
    fallbackProjectConfigId,
  );
  const requestId = resolveRevealRequestId(content);
  const parsedRevealContent = UISettingRevealContentSchema.safeParse(content);
  if (!parsedRevealContent.success) {
    sendUISettingRevealResult({
      projectConfigId,
      requestId,
      statuses: buildMalformedRevealStatuses(
        content,
        "Invalid UISettingReveal payload.",
      ),
      context,
    });
    return;
  }
  const revealContent: UISettingRevealContent = parsedRevealContent.data;
  const revealExecutionContext = buildRevealExecutionContext(
    revealContent,
    context,
  );
  const statuses = await executeIncomingUISettingReveal(
    revealContent,
    revealExecutionContext,
  );
  sendUISettingRevealResult({
    projectConfigId: revealContent.projectConfigId,
    requestId: revealContent.requestId,
    statuses,
    context,
  });
}

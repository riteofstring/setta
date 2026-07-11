export function assertLosslessSteeringChatRecord(page, requestText, steeringText) {
  if (!isHiddenEasyRunConversation(page)) {
    throw new Error(
      `easy-button backing conversation was not hidden and Easy Run-owned: ${JSON.stringify(page)}`,
    );
  }
  const trigger = page.messages.find((message) => triggerMessageMatches(message, requestText));
  const steeringMessages = page.messages.filter(isSteeringUserMessage);
  const steering = steeringMessages.find((message) =>
    messagePartsContainExactText(message.parts, steeringText),
  );
  if (!acceptedMessagesMatch(trigger, steeringMessages, steering)) {
    throw new Error(
      `easy-button chat record did not retain exact trigger and steering messages: ${JSON.stringify(page)}`,
    );
  }
  const steeringBlock = page.blocks.find(
    (block) => block.kind === "user_message" && block.userMessage?.messageId === steering.id,
  );
  if (!steeringBlockMatches(steeringBlock, steeringText)) {
    throw new Error(
      `easy-button transcript did not retain the exact persisted steering message: ${JSON.stringify(page)}`,
    );
  }
}

function isHiddenEasyRunConversation(page) {
  return page?.conversation?.internal === true && Boolean(page.conversation.easyRun?.easyRunId);
}

function triggerMessageMatches(message, requestText) {
  return (
    message.role === "user" &&
    message.delivery === "normal" &&
    messagePartsContainExactText(message.parts, requestText)
  );
}

function isSteeringUserMessage(message) {
  return message.role === "user" && message.delivery === "steering";
}

function acceptedMessagesMatch(trigger, steeringMessages, steering) {
  return Boolean(trigger) && steeringMessages.length === 1 && steering?.status === "complete";
}

function steeringBlockMatches(block, steeringText) {
  const message = block?.userMessage;
  return (
    message?.role === "user" &&
    message.delivery === "steering" &&
    message.status === "complete" &&
    messagePartsContainExactText(message.parts, steeringText)
  );
}

function messagePartsContainExactText(parts, text) {
  return parts.some((part) => part.type === "text" && part.text?.text === text);
}

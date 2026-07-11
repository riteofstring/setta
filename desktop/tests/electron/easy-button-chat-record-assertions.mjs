export function assertLosslessSteeringChatRecord(page, requestText, steeringText) {
  if (!isHiddenEasyRunConversation(page)) {
    throw new Error(
      `easy-button backing conversation was not hidden and Easy Run-owned: ${JSON.stringify(page)}`,
    );
  }
  const triggerMessages = page.messages.filter((message) =>
    exactUserMessageMatches(message, "normal", requestText),
  );
  const steeringMessages = page.messages.filter(isSteeringUserMessage);
  const steering = steeringMessages.find((message) =>
    exactUserMessageMatches(message, "steering", steeringText),
  );
  if (triggerMessages.length !== 1 || steeringMessages.length !== 1 || !steering) {
    throw new Error(
      `easy-button chat record did not retain exact trigger and steering messages: ${JSON.stringify(page)}`,
    );
  }
  const trigger = triggerMessages[0];
  const triggerBlock = userMessageBlock(page, trigger.id);
  const steeringBlock = userMessageBlock(page, steering.id);
  if (
    !exactUserMessageBlockMatches(triggerBlock, "normal", requestText) ||
    !exactUserMessageBlockMatches(steeringBlock, "steering", steeringText)
  ) {
    throw new Error(
      `easy-button transcript did not retain exact committed trigger and steering messages: ${JSON.stringify(page)}`,
    );
  }
}

function isHiddenEasyRunConversation(page) {
  return page?.conversation?.internal === true && Boolean(page.conversation.easyRun?.easyRunId);
}

function exactUserMessageMatches(message, delivery, text) {
  return (
    message.role === "user" &&
    message.delivery === delivery &&
    message.status === "complete" &&
    messagePartsMatchExactPlainText(message.parts, text)
  );
}

function isSteeringUserMessage(message) {
  return message.role === "user" && message.delivery === "steering";
}

function userMessageBlock(page, messageId) {
  return page.blocks.find(
    (block) => block.kind === "user_message" && block.userMessage?.messageId === messageId,
  );
}

function exactUserMessageBlockMatches(block, delivery, text) {
  const message = block?.userMessage;
  return (
    message?.role === "user" &&
    message.delivery === delivery &&
    message.status === "complete" &&
    messagePartsMatchExactPlainText(message.parts, text)
  );
}

function messagePartsMatchExactPlainText(parts, text) {
  const [part] = parts;
  return (
    parts.length === 1 &&
    part.type === "text" &&
    part.text?.format === "plain" &&
    part.text.text === text &&
    part.image === null
  );
}

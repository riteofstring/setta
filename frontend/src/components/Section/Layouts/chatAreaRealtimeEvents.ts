import { sendRealtimeDependencyEvent } from "state/actions/websocketRealtimeDispatch";
import {
  ChatFileAttachment,
  ChatRoleEnum,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  LiteralDependencyValue,
} from "utils/generatedTypes";

type ChatSendActionPayload = {
  action: "send";
  sectionId: string;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  role: ChatRoleEnum;
  timestampMs: number;
  managed: boolean;
};

type ChatStopActionPayload = {
  action: "stop";
  sectionId: string;
  timestampMs: number;
  managed: boolean;
};

type ChatActionPayload = ChatSendActionPayload | ChatStopActionPayload;

type EmitChatSendActionArgs = {
  sectionId: string;
  messageId: string;
  text: string;
  attachments: ChatFileAttachment[];
  role: ChatRoleEnum;
  managed: boolean;
  timestampMs: number;
};

type EmitChatStopActionArgs = {
  sectionId: string;
  managed: boolean;
  timestampMs: number;
};

function emitChatAction(payload: ChatActionPayload) {
  const literalPayload: LiteralDependencyValue = {
    payload: JSON.stringify(payload),
    type: DependencyValueTypeEnum.Literal,
  };
  sendRealtimeDependencyEvent({
    dependencyKey: {
      type: DependencyKeyTypeEnum.Section,
      sectionId: payload.sectionId,
    },
    payload: literalPayload,
    timestampMs: payload.timestampMs,
  });
}

export function emitChatSendAction({
  sectionId,
  messageId,
  text,
  attachments,
  role,
  managed,
  timestampMs,
}: EmitChatSendActionArgs) {
  emitChatAction({
    action: "send",
    sectionId,
    messageId,
    text,
    attachments,
    role,
    managed,
    timestampMs,
  });
}

export function emitChatStopAction({
  sectionId,
  managed,
  timestampMs,
}: EmitChatStopActionArgs) {
  emitChatAction({
    action: "stop",
    sectionId,
    managed,
    timestampMs,
  });
}

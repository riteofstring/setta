import type { ListTopicConversationsRequest, NavigatorPage } from "@generated/backend";

export const conversationIpcChannels = {
  conversationListTopicConversations: "conversation:list-topic-conversations",
} as const;

export interface ConversationIpc {
  conversationListTopicConversations: {
    args: [request: ListTopicConversationsRequest];
    result: NavigatorPage;
  };
}

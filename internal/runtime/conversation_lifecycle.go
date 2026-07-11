package runtime

import (
	"setta/internal/conversation"
	"setta/internal/httpapi"
)

func conversationNavigatorService(store *conversation.Store) httpapi.ConversationNavigatorService {
	if store == nil {
		return nil
	}
	return store
}

func (server *Server) shutdownConversationStore() error {
	if server.closeConversationStore != nil {
		return server.closeConversationStore()
	}
	return nil
}

func (server *Server) Addr() string {
	return server.listener.Addr().String()
}

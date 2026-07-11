package runtime

import "context"

func (server *Server) shutdownConversationTurns(ctx context.Context) error {
	if server.drainConversationTurns == nil {
		return nil
	}
	return server.drainConversationTurns(ctx)
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

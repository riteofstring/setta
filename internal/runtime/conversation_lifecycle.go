package runtime

import "context"

func (server *Server) shutdownConversationTurns(ctx context.Context) error {
	if server.drainConversationTurns == nil {
		return nil
	}
	return server.drainConversationTurns(ctx)
}

func (server *Server) shutdownNarration(ctx context.Context) error {
	if server.drainNarration == nil {
		return nil
	}
	return server.drainNarration(ctx)
}

func (server *Server) shutdownMasterRouting(ctx context.Context) error {
	if server.drainMasterRouting == nil {
		return nil
	}
	return server.drainMasterRouting(ctx)
}

func (server *Server) shutdownSpeech(ctx context.Context) error {
	if server.drainSpeech == nil {
		return nil
	}
	return server.drainSpeech(ctx)
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

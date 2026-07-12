package runtime

import "context"

func (server *Server) shutdownChatTurns(ctx context.Context) error {
	if server.drainChatTurns == nil {
		return nil
	}
	return server.drainChatTurns(ctx)
}

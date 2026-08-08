package launcher

import (
	"setta/internal/auth"
	"setta/internal/localsessions"
)

func rollbackStartedLocalSession(session auth.SessionMetadata, runtimeRoot string) error {
	return localsessions.RollbackStartedLocalSession(session, runtimeRoot)
}

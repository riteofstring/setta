package codexapp

func providerScopeUnownedFallbackMatches(sessions []*Session, kind EventKind) []sessionMatch {
	matches := make([]sessionMatch, 0, len(sessions))
	for _, session := range sessions {
		if session.acceptsUnscopedKind(kind) {
			matches = append(matches, sessionMatch{session: session, score: 0})
		}
	}
	if len(matches) == 1 || kind == EventRequest {
		return matches
	}
	return nil
}

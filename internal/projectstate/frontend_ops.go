package projectstate

import (
	"context"
	"sort"
	"strings"
)

type FrontendOpStatus struct {
	Pending   []string
	Completed []string
}

type frontendOpContextKey struct{}

func ContextWithFrontendOpID(ctx context.Context, frontendOpID string) context.Context {
	normalized := normalizeFrontendOpID(frontendOpID)
	if normalized == "" {
		return ctx
	}
	return context.WithValue(ctx, frontendOpContextKey{}, normalized)
}

func frontendOpIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	value, _ := ctx.Value(frontendOpContextKey{}).(string)
	return normalizeFrontendOpID(value)
}

func normalizeFrontendOpID(frontendOpID string) string {
	return strings.TrimSpace(frontendOpID)
}

func cloneFrontendOpStatus(pending map[string]struct{}, completed []string) FrontendOpStatus {
	pendingIDs := make([]string, 0, len(pending))
	for frontendOpID := range pending {
		pendingIDs = append(pendingIDs, frontendOpID)
	}
	sort.Strings(pendingIDs)

	completedIDs := make([]string, len(completed))
	copy(completedIDs, completed)

	return FrontendOpStatus{
		Pending:   pendingIDs,
		Completed: completedIDs,
	}
}

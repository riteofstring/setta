package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/projectstate"
	"setta/internal/realtime"
)

const watchCodeSignatureWarningMessage = "Watch Code could not resolve params for %s. Verify the module import path or add imports in gen code prefix."

type watchCodeSignatureObserver struct {
	delegate projectstate.CallableSignatureResolver

	mu       sync.Mutex
	attempts map[string]projectstate.SignatureHelpStatus
}

func newWatchCodeSignatureObserver(delegate projectstate.CallableSignatureResolver) *watchCodeSignatureObserver {
	return &watchCodeSignatureObserver{
		delegate: delegate,
		attempts: map[string]projectstate.SignatureHelpStatus{},
	}
}

func (o *watchCodeSignatureObserver) ResolveCallableSignature(
	ctx context.Context,
	project projectstate.Project,
	sectionID string,
	callableName string,
) (projectstate.CallableSignatureResult, bool, error) {
	if o == nil || o.delegate == nil {
		return projectstate.CallableSignatureResult{}, false, nil
	}

	result, ok, err := o.delegate.ResolveCallableSignature(ctx, project, sectionID, callableName)
	if err == nil && ok {
		o.recordAttempt(callableName, result.Status)
	}
	return result, ok, err
}

func (o *watchCodeSignatureObserver) recordAttempt(callableName string, status projectstate.SignatureHelpStatus) {
	if o == nil {
		return
	}

	trimmedCallableName := strings.TrimSpace(callableName)
	if trimmedCallableName == "" {
		return
	}

	o.mu.Lock()
	defer o.mu.Unlock()

	currentStatus, ok := o.attempts[trimmedCallableName]
	if !ok || signatureStatusPriority(status) > signatureStatusPriority(currentStatus) {
		o.attempts[trimmedCallableName] = status
	}
}

func (o *watchCodeSignatureObserver) Attempts() map[string]projectstate.SignatureHelpStatus {
	if o == nil {
		return map[string]projectstate.SignatureHelpStatus{}
	}

	o.mu.Lock()
	defer o.mu.Unlock()

	output := make(map[string]projectstate.SignatureHelpStatus, len(o.attempts))
	for callableName, status := range o.attempts {
		output[callableName] = status
	}
	return output
}

func signatureStatusPriority(status projectstate.SignatureHelpStatus) int {
	switch status {
	case projectstate.SignatureHelpStatusNoMatch:
		return 3
	case projectstate.SignatureHelpStatusMatched:
		return 2
	default:
		return 1
	}
}

type watchCodeWarningKey struct {
	projectID    string
	callableName string
	sourcePath   string
}

type watchCodeWarningTracker struct {
	mu          sync.Mutex
	active      map[watchCodeWarningKey]struct{}
	idGenerator func() string
	timeNow     func() time.Time
}

func newWatchCodeWarningTracker() *watchCodeWarningTracker {
	return &watchCodeWarningTracker{
		active:      map[watchCodeWarningKey]struct{}{},
		idGenerator: newWatchCodeNotificationID,
		timeNow:     time.Now,
	}
}

func (t *watchCodeWarningTracker) ReconcileDocument(document projectstate.Document) {
	if t == nil {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	t.reconcileDocumentLocked(document)
}

func (t *watchCodeWarningTracker) ConsumeNotifications(
	document projectstate.Document,
	projectID string,
	attempts map[string]projectstate.SignatureHelpStatus,
) []realtime.NotificationMessage {
	if t == nil {
		return nil
	}

	trimmedProjectID := strings.TrimSpace(projectID)

	t.mu.Lock()
	defer t.mu.Unlock()

	t.reconcileDocumentLocked(document)

	project, ok := document.Projects[trimmedProjectID]
	if !ok {
		return nil
	}

	callableNames := make([]string, 0, len(attempts))
	for callableName := range attempts {
		callableNames = append(callableNames, callableName)
	}
	sort.Strings(callableNames)

	messages := make([]realtime.NotificationMessage, 0)
	for _, callableName := range callableNames {
		status := attempts[callableName]
		trimmedCallableName := strings.TrimSpace(callableName)
		if trimmedCallableName == "" {
			continue
		}
		entry, ok := watchCodeCallableEntry(project, trimmedCallableName)
		if !ok {
			t.deleteProjectCallableLocked(trimmedProjectID, trimmedCallableName)
			continue
		}

		if status == projectstate.SignatureHelpStatusNoMatch {
			key := watchCodeWarningKey{
				projectID:    trimmedProjectID,
				callableName: trimmedCallableName,
				sourcePath:   strings.TrimSpace(entry.SourcePath),
			}
			if _, ok := t.active[key]; ok {
				continue
			}
			t.active[key] = struct{}{}
			messages = append(messages, realtime.NewNotificationMessage(realtime.NotificationContent{
				ID:              t.idGenerator(),
				ProjectConfigID: trimmedProjectID,
				Type:            realtime.NotificationTypeWarning,
				Message:         fmt.Sprintf(watchCodeSignatureWarningMessage, key.callableName),
				Temporary:       true,
				Timestamp:       t.timeNow().UTC().Format(time.RFC3339Nano),
				Metadata:        map[string]any{},
				ReadStatus:      false,
			}))
			continue
		}

		t.deleteProjectCallableLocked(trimmedProjectID, trimmedCallableName)
	}

	return messages
}

func (t *watchCodeWarningTracker) reconcileDocumentLocked(document projectstate.Document) {
	for key := range t.active {
		project, ok := document.Projects[key.projectID]
		if !ok {
			delete(t.active, key)
			continue
		}
		entry, ok := watchCodeCallableEntry(project, key.callableName)
		if !ok || strings.TrimSpace(entry.SourcePath) != key.sourcePath {
			delete(t.active, key)
		}
	}
}

func (t *watchCodeWarningTracker) deleteProjectCallableLocked(projectID string, callableName string) {
	for key := range t.active {
		if key.projectID == projectID && key.callableName == callableName {
			delete(t.active, key)
		}
	}
}

func watchCodeCallableEntry(project projectstate.Project, callableName string) (projectstate.WatchCodeRegistryEntry, bool) {
	targetName := strings.TrimSpace(callableName)
	if targetName == "" {
		return projectstate.WatchCodeRegistryEntry{}, false
	}
	for _, entry := range project.WatchCodeRegistry {
		if strings.TrimSpace(entry.CallableName) == targetName {
			return entry, true
		}
	}
	return projectstate.WatchCodeRegistryEntry{}, false
}

func newWatchCodeNotificationID() string {
	buffer := make([]byte, 8)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Sprintf("app: generate watch code notification id: %v", err))
	}
	return hex.EncodeToString(buffer)
}

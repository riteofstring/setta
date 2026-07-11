package agent

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

const MaxThreadPageSize = 200

func (request StartThreadRequest) Validate() error {
	if err := validateWorkspaceRoot(request.WorkspaceRoot); err != nil {
		return err
	}
	return request.Invocation.Validate()
}

func (request ForkThreadRequest) Validate() error {
	if strings.TrimSpace(request.ParentThreadID) == "" {
		return errors.New("parent provider thread id is required")
	}
	if request.LastTurnID != nil && strings.TrimSpace(*request.LastTurnID) == "" {
		return errors.New("fork last turn id must not be empty")
	}
	if err := validateWorkspaceRoot(request.WorkspaceRoot); err != nil {
		return err
	}
	return request.Invocation.Validate()
}

func (request ListThreadsRequest) Validate() error {
	if request.Limit <= 0 || request.Limit > MaxThreadPageSize {
		return fmt.Errorf("thread list limit must be between 1 and %d", MaxThreadPageSize)
	}
	if request.SearchTerm != nil && strings.TrimSpace(*request.SearchTerm) == "" {
		return errors.New("thread list search term must not be empty")
	}
	return nil
}

func (request SearchThreadsRequest) Validate() error {
	if request.Limit <= 0 || request.Limit > MaxThreadPageSize {
		return fmt.Errorf("thread search limit must be between 1 and %d", MaxThreadPageSize)
	}
	if strings.TrimSpace(request.SearchTerm) == "" {
		return errors.New("thread search term is required")
	}
	return nil
}

func (request TurnRequest) Validate() error {
	if strings.TrimSpace(request.ConversationID) == "" || strings.TrimSpace(request.TurnID) == "" {
		return errors.New("agent turn requires conversation and Setta turn ids")
	}
	if strings.TrimSpace(request.ProviderThreadID) == "" {
		return errors.New("agent turn provider thread id is required")
	}
	if strings.TrimSpace(request.ClientInputID) == "" {
		return errors.New("agent turn client input id is required")
	}
	if strings.TrimSpace(request.Text) == "" {
		return errors.New("agent turn text is required")
	}
	if err := validateWorkspaceRoot(request.WorkspaceRoot); err != nil {
		return err
	}
	return request.Invocation.Validate()
}

func (request TurnControlRequest) Validate(requireText bool) error {
	if strings.TrimSpace(request.ConversationID) == "" ||
		strings.TrimSpace(request.ProviderThreadID) == "" ||
		strings.TrimSpace(request.ProviderTurnID) == "" {
		return errors.New("agent turn control requires conversation, provider thread, and provider turn ids")
	}
	if requireText {
		if strings.TrimSpace(request.ClientInputID) == "" || strings.TrimSpace(request.Text) == "" {
			return errors.New("agent steering requires client input id and text")
		}
	}
	return nil
}

func validateWorkspaceRoot(root string) error {
	if strings.TrimSpace(root) == "" {
		return errors.New("agent workspace root is required")
	}
	if !filepath.IsAbs(root) {
		return fmt.Errorf("agent workspace root must be absolute: %s", root)
	}
	return nil
}

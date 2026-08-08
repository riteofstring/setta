package plugins

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"setta/internal/projectstate"
)

var (
	ErrRegisteredCodegenTargetNotFound = errors.New("plugin codegen target is not registered")
	ErrRegisteredCodegenTargetConflict = errors.New("plugin codegen target registration is ambiguous")
)

type registeredCodegenTargetMatch struct {
	Entry  DiscoveredPlugin
	Target PluginRegisteredCodegenTarget
}

func (s *Service) ValidateProjectCodegenTarget(_ context.Context, target projectstate.ProjectCodegenTarget) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	normalizedTarget, err := target.Normalized()
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return err
	}

	_, ok, err := findRegisteredCodegenTargetMatch(snapshot.Plugins, normalizedTarget.Language)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("%w: %s", ErrRegisteredCodegenTargetNotFound, normalizedTarget.Language)
	}
	return nil
}

func findRegisteredCodegenTargetMatch(entries []DiscoveredPlugin, language string) (registeredCodegenTargetMatch, bool, error) {
	normalizedLanguage := strings.TrimSpace(language)
	if normalizedLanguage == "" {
		return registeredCodegenTargetMatch{}, false, fmt.Errorf("codegen target language is required")
	}

	var match registeredCodegenTargetMatch
	found := false
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		if !containsString(entry.EffectiveCapabilities, "registerCodegenTarget") {
			continue
		}

		for _, target := range entry.RegisteredCodegenTargets {
			if target.Language != normalizedLanguage {
				continue
			}
			if !found {
				match = registeredCodegenTargetMatch{
					Entry:  entry,
					Target: target,
				}
				found = true
				continue
			}
			return registeredCodegenTargetMatch{}, false, fmt.Errorf(
				"%w: %s registered by %s and %s",
				ErrRegisteredCodegenTargetConflict,
				normalizedLanguage,
				match.Entry.PluginID,
				entry.PluginID,
			)
		}
	}
	return match, found, nil
}

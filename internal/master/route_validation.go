package master

import (
	"fmt"
	"strings"
)

func validateRouteConversationInput(conversationID string, input string) error {
	if err := validateRouteReference("master route conversation id", conversationID); err != nil {
		return err
	}
	return validateRouteText("master route authored input", input, MaxRouteAuthoredInputBytes)
}

func validateRouteReference(label string, value string) error {
	return validateBoundedIdentifier(label, value, MaxRouteReferenceBytes)
}

func validateRouteText(label string, value string, maximum int) error {
	if strings.TrimSpace(value) == "" || strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must be non-empty without surrounding whitespace", label)
	}
	if len(value) > maximum {
		return fmt.Errorf("%s exceeds %d bytes", label, maximum)
	}
	return nil
}

func validateUniqueRouteReferences(label string, values []string) error {
	seen := map[string]bool{}
	for _, value := range values {
		if err := validateRouteReference("master route "+label, value); err != nil {
			return err
		}
		if seen[value] {
			return fmt.Errorf("master route context repeats %s %s", label, value)
		}
		seen[value] = true
	}
	return nil
}

func validateUniqueRouteDecisionKinds(kinds []RouteDecisionKind) error {
	seen := map[RouteDecisionKind]bool{}
	for _, kind := range kinds {
		if !validRouteDecisionKind(kind) {
			return fmt.Errorf("unsupported master route decision kind %q", kind)
		}
		if kind == RouteDecisionKindCreateConversation || kind == RouteDecisionKindClarify ||
			kind == RouteDecisionKindAnswerGlobal {
			return fmt.Errorf("master route target authority cannot carry global decision kind %s", kind)
		}
		if seen[kind] {
			return fmt.Errorf("master route target authority repeats decision kind %s", kind)
		}
		seen[kind] = true
	}
	return nil
}

package agent

import (
	"testing"

	"setta/internal/codexapp"
)

func TestProviderNotificationMatrixClassifiesEveryUpstreamNotification(t *testing.T) {
	rules := providerNotificationRulesByMethod(t)
	for _, method := range codexapp.CodexUpstreamNotificationValues {
		if _, ok := rules[method]; !ok {
			t.Errorf("upstream notification %s has no adapter matrix rule", method)
		}
	}
}

func TestProviderNotificationMatrixRejectsMethodsOutsideTheSnapshot(t *testing.T) {
	upstream := map[string]bool{}
	for _, method := range codexapp.CodexUpstreamNotificationValues {
		upstream[method] = true
	}
	for _, rule := range providerNotificationMatrix {
		switch {
		case upstream[rule.Method] && rule.UpstreamSource != "":
			t.Errorf("rule %s is in the schema union and must not declare an upstream source", rule.Method)
		case !upstream[rule.Method] && rule.UpstreamSource == "":
			t.Errorf("rule %s is not in the schema union and must declare where it is defined upstream", rule.Method)
		}
	}
}

func TestProviderNotificationMatrixDocumentsEveryDisposition(t *testing.T) {
	for _, rule := range providerNotificationMatrix {
		switch rule.Disposition {
		case ProviderNotificationNormalized,
			ProviderNotificationEvidence,
			ProviderNotificationTransport,
			ProviderNotificationPrivate,
			ProviderNotificationHost,
			ProviderNotificationUnowned:
		default:
			t.Errorf("rule %s has unknown disposition %q", rule.Method, rule.Disposition)
		}
		if rule.Note == "" {
			t.Errorf("rule %s has no note explaining its disposition", rule.Method)
		}
	}
}

func TestProviderNotificationNormalizersStayInsideMatrixAuthority(t *testing.T) {
	rules := providerNotificationRulesByMethod(t)
	for method := range providerNotificationHandlers {
		rule, ok := rules[method]
		if !ok {
			t.Errorf("normalizer for %s has no adapter matrix rule", method)
			continue
		}
		if rule.Disposition != ProviderNotificationNormalized &&
			rule.Disposition != ProviderNotificationEvidence {
			t.Errorf("provider handler for %s exceeds its %q disposition", method, rule.Disposition)
		}
		if rule.OptOut {
			t.Errorf("normalizer for %s is registered for a notification Setta opts out of", method)
		}
	}
}

func TestEveryNormalizedProviderNotificationHasAnAdapterPath(t *testing.T) {
	for _, rule := range providerNotificationMatrix {
		if rule.Disposition != ProviderNotificationNormalized {
			continue
		}
		if providerNotificationHandlers[rule.Method] == nil {
			t.Errorf("normalized notification %s has no adapter handler", rule.Method)
		}
	}
}

func TestProviderNotificationMatrixOptsOutOfPrivateReasoning(t *testing.T) {
	registered := map[string]bool{}
	for _, method := range codexapp.CodexSupportedNotificationValues {
		registered[method] = true
	}
	private := 0
	for _, rule := range providerNotificationMatrix {
		if rule.Disposition == ProviderNotificationPrivate {
			private++
			if !rule.OptOut {
				t.Errorf("private notification %s must be opted out at the protocol boundary", rule.Method)
			}
		}
		if rule.OptOut && !registered[rule.Method] {
			t.Errorf("opt-out notification %s is not a registered protocol method", rule.Method)
		}
	}
	if private == 0 {
		t.Fatal("matrix classifies no private reasoning notification")
	}
	methods := providerNotificationOptOutMethods()
	if len(methods) != 2 ||
		methods[0] != codexapp.CodexNotificationItemReasoningTextDelta ||
		methods[1] != codexapp.CodexNotificationThreadStarted {
		t.Fatalf("opt-out methods = %v, want private reasoning deltas and thread/started", methods)
	}
}

func providerNotificationRulesByMethod(t *testing.T) map[string]ProviderNotificationRule {
	t.Helper()
	rules := map[string]ProviderNotificationRule{}
	for _, rule := range providerNotificationMatrix {
		if _, exists := rules[rule.Method]; exists {
			t.Fatalf("notification %s has more than one adapter matrix rule", rule.Method)
		}
		rules[rule.Method] = rule
	}
	return rules
}

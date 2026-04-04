package uisettings

import "testing"

func TestBuildPluginPaneOverviewTabKeyMatchesEncodeURIComponentRules(t *testing.T) {
	t.Parallel()

	got := buildPluginPaneOverviewTabKey(
		"plugin!~*'() /",
		"pane!~*'() :?",
	)
	const want = "PluginPane:plugin!~*'()%20%2F:pane!~*'()%20%3A%3F"
	if got != want {
		t.Fatalf("expected plugin pane overview tab key %q, got %q", want, got)
	}
}

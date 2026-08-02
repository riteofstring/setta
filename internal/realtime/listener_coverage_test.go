package realtime

import "testing"

func TestBuildListenerCoverageSnapshotIgnoresRefreshOnlyCallbacks(t *testing.T) {
	t.Parallel()

	// Coverage snapshots should only reflect callbacks that can receive
	// realtime updates, not refresh-only registrations.
	snapshot, err := BuildListenerCoverageSnapshot("project-a", []ListenerRegistration{
		{
			ProjectID: "project-a",
			Callbacks: map[string]ListenerCallback{
				"cb-param": {
					Dependencies:   []string{"section-a.param-a"},
					DependencyMode: ListenerDependencyModeAlways,
				},
				"cb-section": {
					Dependencies:   []string{"section-b"},
					DependencyMode: ListenerDependencyModeRealtimeOnly,
				},
				"cb-refresh-only": {
					Dependencies:   []string{"section-c"},
					DependencyMode: ListenerDependencyModeRefreshOnly,
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("build listener coverage snapshot: %v", err)
	}

	if snapshot.ProjectID != "project-a" {
		t.Fatalf("expected project-a snapshot, got %q", snapshot.ProjectID)
	}
	if snapshot.HasRealtimeWildcard {
		t.Fatal("expected no realtime wildcard")
	}
	if len(snapshot.Dependencies) != 2 {
		t.Fatalf("expected 2 dependencies, got %#v", snapshot.Dependencies)
	}
	if snapshot.Dependencies[0] != (ListenerCoverageDependency{Type: DependencyKeyTypeSectionParam, SectionID: "section-a", CodeObjID: "param-a"}) {
		t.Fatalf("unexpected first dependency %#v", snapshot.Dependencies[0])
	}
	if snapshot.Dependencies[1] != (ListenerCoverageDependency{Type: DependencyKeyTypeSection, SectionID: "section-b"}) {
		t.Fatalf("unexpected second dependency %#v", snapshot.Dependencies[1])
	}
}

func TestBuildListenerCoverageSnapshotTracksRealtimeWildcard(t *testing.T) {
	t.Parallel()

	// Empty dependency lists represent wildcard realtime listeners and must be
	// surfaced separately from explicit dependency keys.
	snapshot, err := BuildListenerCoverageSnapshot("project-a", []ListenerRegistration{
		{
			ProjectID: "project-a",
			Callbacks: map[string]ListenerCallback{
				"cb-any": {
					Dependencies:   nil,
					DependencyMode: ListenerDependencyModeAlways,
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("build wildcard listener coverage snapshot: %v", err)
	}
	if !snapshot.HasRealtimeWildcard {
		t.Fatal("expected realtime wildcard")
	}
	if len(snapshot.Dependencies) != 0 {
		t.Fatalf("expected no explicit dependencies, got %#v", snapshot.Dependencies)
	}
}

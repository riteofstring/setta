package wsapi

import (
	"context"
	"testing"

	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"

	"github.com/coder/websocket"
)

func TestRegisterRoutesListenerInitIncludesDependencyCatalog(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	sectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "TextBlock", "note")
	if _, err := projectRuntime.SetTextBlockText(context.Background(), "project-a", sectionID, "Hello from Go"); err != nil {
		t.Fatalf("set text block text: %v", err)
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-a"}}`)); err != nil {
		t.Fatalf("write listener init: %v", err)
	}

	content := decodeRouteListenerForceRefreshContent(t, readNextMessage(t, conn))
	expectedName := routeListenerDependencyName(t, projectRuntime.Snapshot().Document, "project-a", sectionID, "")
	foundCatalog := false
	for _, entry := range content.Snapshot.DependencyCatalog.Entries {
		if entry.DependencyKey != sectionID {
			continue
		}
		if entry.FullPathName != expectedName {
			t.Fatalf("expected dependency name %q, got %q", expectedName, entry.FullPathName)
		}
		foundCatalog = true
		break
	}
	if !foundCatalog {
		t.Fatalf("expected dependency catalog to include section %q", sectionID)
	}

	for _, entry := range content.Snapshot.DependencyValues.Entries {
		if entry.DependencyKey != sectionID {
			continue
		}
		if entry.RenderedValue != "'Hello from Go'" {
			t.Fatalf("expected rendered dependency value %q, got %q", "'Hello from Go'", entry.RenderedValue)
		}
		return
	}

	t.Fatalf("expected dependency values to include section %q", sectionID)
}

func TestRegisterRoutesListenerInitCatalogIncludesSectionAndParamEntries(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntime(t, "project-a")
	sectionID := createRouteTopLevelSection(t, projectRuntime, "project-a", "Dict", "inputs")
	_, addParamResult, err := projectRuntime.AddKwarg(context.Background(), "project-a", sectionID)
	if err != nil {
		t.Fatalf("add dict param: %v", err)
	}
	if _, err := projectRuntime.SetCodeObjectName(context.Background(), "project-a", addParamResult.CodeObjID, "count"); err != nil {
		t.Fatalf("rename dict param: %v", err)
	}
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-a"}}`)); err != nil {
		t.Fatalf("write listener init: %v", err)
	}

	content := decodeRouteListenerForceRefreshContent(t, readNextMessage(t, conn))
	document := projectRuntime.Snapshot().Document
	expectedEntries := map[string]string{
		sectionID: routeListenerDependencyName(t, document, "project-a", sectionID, ""),
		sectionID + "." + addParamResult.CodeObjID: routeListenerDependencyName(
			t,
			document,
			"project-a",
			sectionID,
			addParamResult.CodeObjID,
		),
	}
	for _, entry := range content.Snapshot.DependencyCatalog.Entries {
		expectedName, ok := expectedEntries[entry.DependencyKey]
		if !ok {
			continue
		}
		if entry.FullPathName != expectedName {
			t.Fatalf("expected dependency %q to use name %q, got %q", entry.DependencyKey, expectedName, entry.FullPathName)
		}
		delete(expectedEntries, entry.DependencyKey)
	}
	if len(expectedEntries) != 0 {
		t.Fatalf("expected dependency catalog to include section and param entries, missing %#v", expectedEntries)
	}
}

func TestRegisterRoutesListenerInitCatalogPreservesStableSanitizedSuffixes(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntimeWithDocument(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-a",
		Projects: map[string]projectstate.Project{
			"project-a": {
				ID:                 "project-a",
				Name:               "Alpha",
				TopLevelSectionIDs: []string{"section-1"},
				SectionVariantMap: map[string]string{
					"section-1": "section-variant-1",
				},
				Sections: map[string]projectstate.Section{
					"section-1": {
						ID:               "section-1",
						Name:             "Run Section",
						VariantIDs:       []string{"section-variant-1"},
						DefaultVariantID: "section-variant-1",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"section-variant-1": {
						ID:     "section-variant-1",
						ImplID: "section-impl-1",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"section-impl-1": {
						ID:   "section-impl-1",
						Kind: projectstate.SectionKind("callable"),
						Payload: projectstate.RawJSON(`{
							"id":"section-impl-1",
							"type":"Callable",
							"callable":"callable-root",
							"codeObjVariantMap":{
								"callable-root":"callable-variant-1",
								"param-1":"param-variant-1",
								"param-2":"param-variant-2"
							}
						}`),
					},
				},
				CodeObjs: map[string]projectstate.CodeObject{
					"callable-root": {
						ID:               "callable-root",
						Name:             "my_callable",
						VariantIDs:       []string{"callable-variant-1"},
						DefaultVariantID: "callable-variant-1",
					},
					"param-1": {
						ID:               "param-1",
						Name:             "value",
						VariantIDs:       []string{"param-variant-1"},
						DefaultVariantID: "param-variant-1",
					},
					"param-2": {
						ID:               "param-2",
						Name:             "value",
						VariantIDs:       []string{"param-variant-2"},
						DefaultVariantID: "param-variant-2",
					},
				},
				CodeObjVariants: map[string]projectstate.CodeObjectVariant{
					"callable-variant-1": {
						ID:     "callable-variant-1",
						ImplID: "callable-impl-1",
					},
					"param-variant-1": {
						ID:     "param-variant-1",
						ImplID: "param-impl-1",
					},
					"param-variant-2": {
						ID:     "param-variant-2",
						ImplID: "param-impl-2",
					},
				},
				CodeObjImpls: map[string]projectstate.CodeObjectImpl{
					"callable-impl-1": {
						ID:   "callable-impl-1",
						Type: "CodeCallable",
						Payload: projectstate.RawJSON(
							`{"id":"callable-impl-1","type":"CodeCallable","children":["param-1","param-2"]}`,
						),
					},
					"param-impl-1": {
						ID:   "param-impl-1",
						Type: "CodeParam",
						Payload: projectstate.RawJSON(
							`{"id":"param-impl-1","type":"CodeParam","value":"1","passingStyle":"DEFAULT"}`,
						),
					},
					"param-impl-2": {
						ID:   "param-impl-2",
						Type: "CodeParam",
						Payload: projectstate.RawJSON(
							`{"id":"param-impl-2","type":"CodeParam","value":"2","passingStyle":"DEFAULT"}`,
						),
					},
				},
			},
		},
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-a"}}`)); err != nil {
		t.Fatalf("write listener init: %v", err)
	}

	content := decodeRouteListenerForceRefreshContent(t, readNextMessage(t, conn))
	fullPathNamesByKey := map[string]string{}
	for _, entry := range content.Snapshot.DependencyCatalog.Entries {
		fullPathNamesByKey[entry.DependencyKey] = entry.FullPathName
	}

	if got := fullPathNamesByKey["section-1.param-1"]; got != "Run_Section__value" {
		t.Fatalf("expected first colliding param dependency name %q, got %q", "Run_Section__value", got)
	}
	if got := fullPathNamesByKey["section-1.param-2"]; got != "Run_Section__value_2" {
		t.Fatalf("expected second colliding param dependency name %q, got %q", "Run_Section__value_2", got)
	}
	if fullPathNamesByKey["section-1.param-1"] == fullPathNamesByKey["section-1.param-2"] {
		t.Fatalf("expected colliding sanitized names to stay distinct, got %#v", fullPathNamesByKey)
	}
}

func TestRegisterRoutesListenerInitResolvesProjectNameAndSendsForceRefresh(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntimeWithDocument(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-default",
		Projects: map[string]projectstate.Project{
			"project-default": {
				ID:   "project-default",
				Name: "Default Project",
			},
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha Project",
			},
		},
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectName":"Alpha Project"}}`)); err != nil {
		t.Fatalf("write listener init by name: %v", err)
	}

	forceRefresh := readNextMessage(t, conn)
	assertRouteListenerForceRefresh(t, forceRefresh, "project-alpha", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-alpha"))
}

func TestRegisterRoutesListenerInitPrefersExplicitProjectIDOverProjectName(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t, config.ModeIDE)
	hub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	broadcaster := realtime.NewListenerBroadcaster(realtime.ListenerBroadcasterOptions{
		WebsocketHub: hub,
	})
	projectRuntime := newRouteProjectRuntimeWithDocument(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-default",
		Projects: map[string]projectstate.Project{
			"project-default": {
				ID:   "project-default",
				Name: "Default Project",
			},
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha Project",
			},
			"project-bravo": {
				ID:   "project-bravo",
				Name: "Bravo Project",
			},
		},
	})
	server := newRouteServer(t, RouteDependencies{
		Transport: Dependencies{
			Auth:       authService,
			ModePolicy: modes.NewPolicy(config.ModeIDE),
		},
		ProjectState:        projectRuntime,
		WebsocketHub:        hub,
		ListenerBroadcaster: broadcaster,
	})
	defer server.Close()

	conn := dialRouteConnection(t, server.URL, RouteListenerByID, authHeaderForCookie(t, authService), withPathParam("listener-a"))
	defer conn.CloseNow()

	if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"messageType":"ListenerInit","content":{"projectConfigId":"project-bravo","projectName":"Alpha Project"}}`)); err != nil {
		t.Fatalf("write listener init with explicit id and name: %v", err)
	}

	forceRefresh := readNextMessage(t, conn)
	assertRouteListenerForceRefresh(t, forceRefresh, "project-bravo", "", routeProjectStatePayload(t, projectRuntime.Snapshot().Document, "project-bravo"))
}

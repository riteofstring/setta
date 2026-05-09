package projectstate

import (
	"context"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

func TestRuntimeApplyWatchCodeFileUpdateSignatureChangeUsesParsedParamsWhenSignatureContextUnavailable(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	initialCallable := mustWatchCodeApplyCallable(
		t,
		"def sorted(iterable):\n    return iterable\n",
		"pkg/watched.py",
	)

	project := callableTestProject(t)
	projectData := EmptyWatchCodePluginProjectData()
	projectData.Files = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}
	projectData.Registry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.sorted:function": {
			CallableName:  "sorted",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: initialCallable.SignatureHash,
			BodyHash:      initialCallable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	projectData.BaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.sorted:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	resolver := &stubCallableSignatureResolver{ok: false}
	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def sorted(iterable, reverse=False):\n    return iterable\n",
		false,
		"",
		workspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply watch code signature change without signature context: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected signature change metadata to change project state")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	project = snapshot.Document.Projects["project-alpha"]
	projectData = mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	entry := projectData.Registry["pkg.watched.sorted:function"]
	if entry.SignatureHash == initialCallable.SignatureHash {
		t.Fatalf("expected signature hash to change, got %#v", entry)
	}

	payload, err := currentCallablePayloadForWatchCodeTest(project, "callable-section")
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID != "callable-2" {
		t.Fatalf("expected current callable id callable-2, got %q", callableID)
	}
	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", callableID)
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 || children[0] != "param-existing" {
		t.Fatalf("expected parsed params to update existing callable, got %#v", children)
	}
	reverseID := children[1]
	if got := project.CodeObjs[reverseID].Name; got != "reverse" {
		t.Fatalf("expected new param reverse, got %q", got)
	}
	reversePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", reverseID)
	if err != nil {
		t.Fatalf("resolve reverse param payload: %v", err)
	}
	if got := payloadStringField(reversePayload, "defaultVal"); got != "False" {
		t.Fatalf("expected reverse param default False, got %q", got)
	}
	iterablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", "param-existing")
	if err != nil {
		t.Fatalf("resolve iterable param payload: %v", err)
	}
	if got := payloadRawStringField(iterablePayload, "value"); got != "user_value" {
		t.Fatalf("expected existing param value to stay user_value, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateReconcilesStaleParamsWhenSignatureHashAlreadyChanged(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	changedCallable := mustWatchCodeApplyCallable(
		t,
		"def sorted(iterable, reverse=False):\n    return iterable\n",
		"pkg/watched.py",
	)

	project := callableTestProject(t)
	projectData := EmptyWatchCodePluginProjectData()
	projectData.Files = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python"}`),
		},
	}
	projectData.Registry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.sorted:function": {
			CallableName:  "sorted",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: changedCallable.SignatureHash,
			BodyHash:      changedCallable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	projectData.BaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.sorted:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	resolver := &stubCallableSignatureResolver{ok: false}
	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def sorted(iterable, reverse=False):\n    return iterable\n",
		false,
		"",
		workspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply watch code stale param reconciliation: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected stale params to be reconciled")
	}
	if resolver.callCount != 1 {
		t.Fatalf("expected one resolver call, got %d", resolver.callCount)
	}

	project = snapshot.Document.Projects["project-alpha"]
	payload, err := currentCallablePayloadForWatchCodeTest(project, "callable-section")
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", callableID)
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	children := payloadStringArrayField(callablePayload, "children")
	if len(children) != 2 || children[0] != "param-existing" {
		t.Fatalf("expected stale params to be replaced by parsed params, got %#v", children)
	}
	if got := project.CodeObjs[children[1]].Name; got != "reverse" {
		t.Fatalf("expected new param reverse, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateRenamePreservesSectionIDsAndParams(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	originalCallable := mustWatchCodeApplyCallable(
		t,
		"def original(value):\n    return value + 1\n",
		"pkg/watched.py",
	)

	project := callableTestProject(t)
	projectData := EmptyWatchCodePluginProjectData()
	projectData.Files = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python","genCodePrefix":"from pkg.watched import original\n"}`),
		},
	}
	projectData.Registry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.original:function": {
			CallableName:  "original",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: originalCallable.SignatureHash,
			BodyHash:      originalCallable.BodyHash,
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	projectData.BaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.original:function"},
	}
	if err := project.setCurrentSectionField("callable-section", "callable", "callable-2"); err != nil {
		t.Fatalf("seed current callable: %v", err)
	}
	callable := project.CodeObjs["callable-2"]
	callable.Name = "original"
	project.CodeObjs["callable-2"] = callable

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def renamed(value):\n    return value + 1\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code rename: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected rename update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	projectData = mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if _, ok := projectData.Registry["pkg.watched.original:function"]; ok {
		t.Fatalf("did not expect original identity to remain: %#v", projectData.Registry)
	}
	entry, ok := projectData.Registry["pkg.watched.renamed:function"]
	if !ok {
		t.Fatalf("expected renamed identity in registry, got %#v", projectData.Registry)
	}
	if !reflect.DeepEqual(entry.SectionIDs, []string{"callable-section"}) {
		t.Fatalf("expected renamed section ids to stay unchanged, got %#v", entry.SectionIDs)
	}
	callable = project.CodeObjs["callable-2"]
	if callable.Name != "renamed" {
		t.Fatalf("expected callable object name renamed, got %#v", callable)
	}
	payload, err := currentCallablePayloadForWatchCodeTest(project, "callable-section")
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callablePayload, _, _, _, err := project.resolveCurrentCodeObjectContext("callable-section", payloadStringField(payload, "callable"))
	if err != nil {
		t.Fatalf("resolve callable payload: %v", err)
	}
	if got := payloadStringArrayField(callablePayload, "children"); !reflect.DeepEqual(got, []string{"param-existing"}) {
		t.Fatalf("expected param ids to stay unchanged, got %#v", got)
	}
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	if target.GenCodePrefix != "from pkg.watched import renamed\n" {
		t.Fatalf("expected renamed import prefix, got %q", target.GenCodePrefix)
	}
}

func TestRuntimeApplyWatchCodeFileDeleteRemovesCallableSectionAndCodeObjects(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")
	project := callableTestProject(t)
	projectData := EmptyWatchCodePluginProjectData()
	projectData.Files = []string{"pkg/watched.py"}
	project.CodegenTargets = []ProjectCodegenTarget{
		{
			Language: string(CodeLanguagePython),
			Payload:  json.RawMessage(`{"language":"python","genCodePrefix":"from pkg.watched import existing_callable\n"}`),
		},
	}
	projectData.Registry = map[string]WatchCodeRegistryEntry{
		"pkg.watched.existing_callable:function": {
			CallableName:  "existing_callable",
			Kind:          WatchCodeCallableKindFunction,
			SignatureHash: "signature",
			BodyHash:      "body",
			SourcePath:    sourcePath,
			SectionIDs:    []string{"callable-section"},
			SectionsCount: 1,
		},
	}
	projectData.BaselineByPath = map[string][]string{
		sourcePath: {"pkg.watched.existing_callable:function"},
	}

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": project,
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", projectData)
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileDelete(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		workspaceRoot,
	)
	if err != nil {
		t.Fatalf("apply watch code delete: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected delete update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	projectData = mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if len(projectData.Registry) != 0 {
		t.Fatalf("expected empty watch code registry, got %#v", projectData.Registry)
	}
	if len(projectData.BaselineByPath) != 0 {
		t.Fatalf("expected empty baseline, got %#v", projectData.BaselineByPath)
	}
	if _, ok := project.Sections["callable-section"]; ok {
		t.Fatalf("did not expect callable section to remain, got %#v", project.Sections)
	}
	if _, ok := project.CodeObjs["callable-1"]; ok {
		t.Fatalf("did not expect callable code object to remain, got %#v", project.CodeObjs)
	}
	if _, ok := project.CodeObjs["param-existing"]; ok {
		t.Fatalf("did not expect callable param to remain, got %#v", project.CodeObjs)
	}
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	if target.GenCodePrefix != "" {
		t.Fatalf("expected watch code import prefix to be removed, got %q", target.GenCodePrefix)
	}
}

func TestRuntimeApplyWatchCodeFileDeleteKeepsSectionWithOtherVariants(t *testing.T) {
	t.Parallel()

	fixture := seedMixedWatchCodeVariantFixture(t)
	project := fixture.Runtime.Snapshot().Document.Projects["project-alpha"]
	projectData := mustReadTestWatchCodePluginProjectData(t, fixture.Runtime.Snapshot().Document, "project-alpha")
	betaEntry := projectData.Registry["pkg.watched.beta:function"]
	if len(betaEntry.SectionIDs) != 2 ||
		!containsString(betaEntry.SectionIDs, fixture.AlphaSectionID) ||
		!containsString(betaEntry.SectionIDs, fixture.BetaSectionID) {
		t.Fatalf("expected beta registry to include both callable sections, got %#v", betaEntry)
	}

	snapshot, didUpdate, err := fixture.Runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		fixture.SourcePath,
		"def beta(value):\n    return value + 1\n",
		false,
		"",
		fixture.WorkspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code delete update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected callable removal update to change project state")
	}

	project = snapshot.Document.Projects["project-alpha"]
	projectData = mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if _, ok := projectData.Registry["pkg.watched.alpha:function"]; ok {
		t.Fatalf("did not expect alpha registry entry to remain, got %#v", projectData.Registry)
	}
	if _, ok := project.Sections[fixture.AlphaSectionID]; !ok {
		t.Fatalf("expected alpha section to remain because another variant still targets beta, got %#v", project.Sections)
	}
	section := project.Sections[fixture.AlphaSectionID]
	if !reflect.DeepEqual(section.VariantIDs, []string{fixture.NewVariantID}) {
		t.Fatalf("expected only the surviving variant to remain, got %#v", section.VariantIDs)
	}
	if project.SectionVariantMap[fixture.AlphaSectionID] != fixture.NewVariantID {
		t.Fatalf(
			"expected active variant to switch to surviving variant %q, got %q",
			fixture.NewVariantID,
			project.SectionVariantMap[fixture.AlphaSectionID],
		)
	}
	payload, err := currentCallablePayloadForWatchCodeTest(project, fixture.AlphaSectionID)
	if err != nil {
		t.Fatalf("current callable payload: %v", err)
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		t.Fatalf("expected surviving variant callable binding, got %#v", payload)
	}
	if got := project.CodeObjs[callableID].Name; got != betaEntry.CallableName {
		t.Fatalf("expected surviving callable name %q, got %q", betaEntry.CallableName, got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateSignatureChangeRefetchesInactiveMatchingVariant(t *testing.T) {
	t.Parallel()

	fixture := seedMixedWatchCodeVariantFixture(t)
	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Status:        SignatureHelpStatusMatched,
			Documentation: "Updated beta docs.",
			Params: []CallableParamProposal{
				{
					Name:           "value",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "int",
				},
				{
					Name:         "reverse",
					DefaultValue: "False",
					PassingStyle: "KEYWORD_ONLY",
				},
			},
		},
	}

	snapshot, didUpdate, err := fixture.Runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		fixture.SourcePath,
		"def alpha(value):\n    return value\n\n\ndef beta(value, reverse=False):\n    return value + 1\n",
		false,
		"",
		fixture.WorkspaceRoot,
		resolver,
	)
	if err != nil {
		t.Fatalf("apply mixed-variant signature update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected mixed-variant signature update to change project state")
	}
	if resolver.callCount != 2 {
		t.Fatalf("expected resolver calls for both beta-bound sections, got %d", resolver.callCount)
	}

	project := snapshot.Document.Projects["project-alpha"]
	if got := project.SectionVariantMap[fixture.AlphaSectionID]; got != fixture.OriginalVariantID {
		t.Fatalf("expected active alpha variant to remain %q, got %q", fixture.OriginalVariantID, got)
	}

	newVariantPayload, err := effectiveSectionPayload(project, fixture.AlphaSectionID, fixture.NewVariantID)
	if err != nil {
		t.Fatalf("resolve new variant payload: %v", err)
	}
	newVariantCallableID := payloadStringField(newVariantPayload, "callable")
	if newVariantCallableID == "" {
		t.Fatalf("expected beta callable to stay selected on mixed variant, got %#v", newVariantPayload)
	}
	codeObjPayload, _, _, _, err := effectiveCodeObjectPayload(
		project,
		payloadStringMapField(newVariantPayload, "codeObjVariantMap"),
		newVariantCallableID,
	)
	if err != nil {
		t.Fatalf("resolve new variant callable payload: %v", err)
	}
	children := payloadStringArrayField(codeObjPayload, "children")
	if len(children) != 2 {
		t.Fatalf("expected refetched beta params on inactive variant, got %#v", children)
	}
	secondParamPayload, _, _, _, err := effectiveCodeObjectPayload(
		project,
		payloadStringMapField(newVariantPayload, "codeObjVariantMap"),
		children[1],
	)
	if err != nil {
		t.Fatalf("resolve new variant added param payload: %v", err)
	}
	if got := payloadStringField(secondParamPayload, "defaultVal"); got != "False" {
		t.Fatalf("expected inactive beta variant to gain reverse default False, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateRenameUpdatesInactiveMatchingVariant(t *testing.T) {
	t.Parallel()

	fixture := seedMixedWatchCodeVariantFixture(t)

	snapshot, didUpdate, err := fixture.Runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		fixture.SourcePath,
		"def alpha(value):\n    return value\n\n\ndef renamed(value):\n    return value + 1\n",
		false,
		"",
		fixture.WorkspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply mixed-variant rename update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected mixed-variant rename update to change project state")
	}

	project := snapshot.Document.Projects["project-alpha"]
	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if got := project.SectionVariantMap[fixture.AlphaSectionID]; got != fixture.OriginalVariantID {
		t.Fatalf("expected active alpha variant to remain %q, got %q", fixture.OriginalVariantID, got)
	}
	if _, ok := projectData.Registry["pkg.watched.beta:function"]; ok {
		t.Fatalf("did not expect beta identity to remain after rename, got %#v", projectData.Registry)
	}
	renamedEntry, ok := projectData.Registry["pkg.watched.renamed:function"]
	if !ok {
		t.Fatalf("expected renamed registry entry, got %#v", projectData.Registry)
	}
	if len(renamedEntry.SectionIDs) != 2 ||
		!containsString(renamedEntry.SectionIDs, fixture.AlphaSectionID) ||
		!containsString(renamedEntry.SectionIDs, fixture.BetaSectionID) {
		t.Fatalf("expected renamed entry to track both callable sections, got %#v", renamedEntry)
	}

	newVariantPayload, err := effectiveSectionPayload(project, fixture.AlphaSectionID, fixture.NewVariantID)
	if err != nil {
		t.Fatalf("resolve renamed mixed variant payload: %v", err)
	}
	callableID := payloadStringField(newVariantPayload, "callable")
	if callableID == "" {
		t.Fatalf("expected renamed callable to stay selected on mixed variant, got %#v", newVariantPayload)
	}
	if got := project.CodeObjs[callableID].Name; got != "renamed" {
		t.Fatalf("expected inactive beta-bound variant callable name renamed, got %q", got)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateMoveIntoTrackedDestinationFromUntrackedCreatesCallableSection(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "untracked", "incoming.py")
	destinationPath := filepath.Join(workspaceRoot, "pkg", "incoming.py")

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Folders: []WatchCodeFolder{{Path: "pkg", Recursive: false}},
	})
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		destinationPath,
		"def incoming(value):\n    return value\n",
		false,
		sourcePath,
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply watch code move-in update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected move-in update to create tracked destination state")
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if _, ok := projectData.BaselineByPath[sourcePath]; ok {
		t.Fatalf("did not expect untracked source baseline entry, got %#v", projectData.BaselineByPath)
	}
	entry, ok := projectData.Registry["pkg.incoming.incoming:function"]
	if !ok {
		t.Fatalf("expected destination registry entry, got %#v", projectData.Registry)
	}
	if entry.SourcePath != destinationPath {
		t.Fatalf("expected destination source path %q, got %q", destinationPath, entry.SourcePath)
	}
	if len(entry.SectionIDs) != 1 || entry.SectionsCount != 1 {
		t.Fatalf("expected one callable section for moved-in destination, got %#v", entry)
	}
	if _, ok := projectData.BaselineByPath[destinationPath]; ok {
		t.Fatalf("did not expect move-in creation to seed destination baseline, got %#v", projectData.BaselineByPath)
	}
}

func TestRuntimeApplyWatchCodeFileUpdateMoveOverExistingDestinationReplacesDestinationState(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "source.py")
	destinationPath := filepath.Join(workspaceRoot, "pkg", "dest.py")

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/source.py", "pkg/dest.py"},
	})
	runtime, err := OpenOverlayRuntime(document)
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def moved(value):\n    return value\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("seed source watch code file: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected source watch code seed update")
	}

	snapshot, didUpdate, err = runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		destinationPath,
		"def stale(value):\n    return value + 1\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("seed destination watch code file: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected destination watch code seed update")
	}

	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	sourceEntry := projectData.Registry["pkg.source.moved:function"]
	destinationEntry := projectData.Registry["pkg.dest.stale:function"]
	sourceSectionID := sourceEntry.SectionIDs[0]
	destinationSectionID := destinationEntry.SectionIDs[0]

	if _, didUpdate, err := runtime.ApplyWatchCodeFileDelete(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		destinationPath,
		workspaceRoot,
	); err != nil {
		t.Fatalf("delete overwritten destination state: %v", err)
	} else if !didUpdate {
		t.Fatal("expected destination delete before overwrite move to change state")
	}

	snapshot, didUpdate, err = runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		destinationPath,
		"def moved(value):\n    return value\n",
		false,
		sourcePath,
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply overwrite move update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected overwrite move update to change project state")
	}

	assertWatchCodeOverwriteMoveState(t, snapshot, sourcePath, destinationPath, sourceSectionID, destinationSectionID)
}

func assertWatchCodeOverwriteMoveState(
	t *testing.T,
	snapshot Snapshot,
	sourcePath string,
	destinationPath string,
	sourceSectionID string,
	destinationSectionID string,
) {
	t.Helper()

	project := snapshot.Document.Projects["project-alpha"]
	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	if _, ok := projectData.Registry["pkg.source.moved:function"]; ok {
		t.Fatalf("did not expect source identity to remain after overwrite move, got %#v", projectData.Registry)
	}
	if _, ok := projectData.Registry["pkg.dest.stale:function"]; ok {
		t.Fatalf("did not expect stale destination identity to remain after overwrite move, got %#v", projectData.Registry)
	}
	entry, ok := projectData.Registry["pkg.dest.moved:function"]
	if !ok {
		t.Fatalf("expected moved destination identity, got %#v", projectData.Registry)
	}
	if entry.SourcePath != destinationPath {
		t.Fatalf("expected moved destination source path %q, got %q", destinationPath, entry.SourcePath)
	}
	if !reflect.DeepEqual(entry.SectionIDs, []string{sourceSectionID}) {
		t.Fatalf("expected moved callable to reuse source section %q, got %#v", sourceSectionID, entry.SectionIDs)
	}
	if _, ok := project.Sections[destinationSectionID]; ok {
		t.Fatalf("did not expect overwritten destination section %q to remain, got %#v", destinationSectionID, project.Sections)
	}
	if got := projectData.BaselineByPath[destinationPath]; !reflect.DeepEqual(got, []string{"pkg.dest.moved:function"}) {
		t.Fatalf("expected moved destination baseline %#v, got %#v", []string{"pkg.dest.moved:function"}, got)
	}
	if _, ok := projectData.BaselineByPath[sourcePath]; ok {
		t.Fatalf("did not expect source baseline after overwrite move, got %#v", projectData.BaselineByPath)
	}
	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	if target.GenCodePrefix != "from pkg.dest import moved\n" {
		t.Fatalf("expected moved destination import prefix, got %q", target.GenCodePrefix)
	}
}

type mixedWatchCodeVariantFixture struct {
	Runtime           *Runtime
	WorkspaceRoot     string
	SourcePath        string
	AlphaSectionID    string
	BetaSectionID     string
	OriginalVariantID string
	NewVariantID      string
}

func seedMixedWatchCodeVariantFixture(t *testing.T) mixedWatchCodeVariantFixture {
	t.Helper()

	workspaceRoot := t.TempDir()
	sourcePath := filepath.Join(workspaceRoot, "pkg", "watched.py")

	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				CodegenTargets: []ProjectCodegenTarget{
					{
						Language: string(CodeLanguagePython),
						Payload:  json.RawMessage(`{"language":"python"}`),
					},
				},
			},
		},
	}
	mustSetTestWatchCodePluginProjectData(t, &document, "project-alpha", WatchCodePluginProjectData{
		Files: []string{"pkg/watched.py"},
	})
	runtime, err := OpenOverlayRuntimeWithOptions(document, RuntimeOptions{
		WatchCodeProviderPluginID: func() (string, bool) {
			return testWatchCodeProviderPluginID, true
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})

	snapshot, didUpdate, err := runtime.ApplyWatchCodeFileUpdate(
		context.Background(),
		testWatchCodeProviderPluginID,
		"project-alpha",
		sourcePath,
		"def alpha(value):\n    return value\n\n\ndef beta(value):\n    return value + 1\n",
		false,
		"",
		workspaceRoot,
		nil,
	)
	if err != nil {
		t.Fatalf("apply initial watch code update: %v", err)
	}
	if !didUpdate {
		t.Fatal("expected initial watch code update to create callable sections")
	}

	project := snapshot.Document.Projects["project-alpha"]
	projectData := mustReadTestWatchCodePluginProjectData(t, snapshot.Document, "project-alpha")
	alphaEntry, ok := projectData.Registry["pkg.watched.alpha:function"]
	if !ok {
		t.Fatalf("expected alpha registry entry, got %#v", projectData.Registry)
	}
	betaEntry, ok := projectData.Registry["pkg.watched.beta:function"]
	if !ok {
		t.Fatalf("expected beta registry entry, got %#v", projectData.Registry)
	}
	alphaSectionID := alphaEntry.SectionIDs[0]
	betaSectionID := betaEntry.SectionIDs[0]
	originalVariantID := project.SectionVariantMap[alphaSectionID]

	_, createResult, err := runtime.CreateNewSectionVariant(
		context.Background(),
		"project-alpha",
		CreateNewSectionVariantInput{SectionID: alphaSectionID},
	)
	if err != nil {
		t.Fatalf("create new section variant: %v", err)
	}
	newVariantID := createResult.VariantID

	if _, err := runtime.SetSectionVariant(
		context.Background(),
		"project-alpha",
		alphaSectionID,
		newVariantID,
	); err != nil {
		t.Fatalf("set active variant to new variant: %v", err)
	}

	resolver := &stubCallableSignatureResolver{
		ok: true,
		result: CallableSignatureResult{
			Status: SignatureHelpStatusMatched,
			Params: []CallableParamProposal{
				{
					Name:           "value",
					PassingStyle:   "POSITIONAL_ONLY",
					TypeAnnotation: "int",
				},
			},
		},
	}
	snapshot, setCallableResponse, err := runtime.SetCallable(
		context.Background(),
		"project-alpha",
		alphaSectionID,
		betaEntry.CallableName,
		false,
		resolver,
	)
	if err != nil {
		t.Fatalf("set beta callable on new variant: %v", err)
	}
	if setCallableResponse.CallableID == nil {
		t.Fatal("expected beta callable to be selected on the new variant")
	}

	project = snapshot.Document.Projects["project-alpha"]
	newVariantPayload, err := effectiveSectionPayload(project, alphaSectionID, newVariantID)
	if err != nil {
		t.Fatalf("resolve new mixed variant payload: %v", err)
	}
	callableID := payloadStringField(newVariantPayload, "callable")
	if callableID == "" {
		t.Fatalf("expected beta callable binding on mixed variant, got %#v", newVariantPayload)
	}
	if got := project.CodeObjs[callableID].Name; got != betaEntry.CallableName {
		t.Fatalf("expected mixed variant callable name %q, got %q", betaEntry.CallableName, got)
	}

	if _, err := runtime.SetSectionVariant(
		context.Background(),
		"project-alpha",
		alphaSectionID,
		originalVariantID,
	); err != nil {
		t.Fatalf("restore original active variant: %v", err)
	}

	return mixedWatchCodeVariantFixture{
		Runtime:           runtime,
		WorkspaceRoot:     workspaceRoot,
		SourcePath:        sourcePath,
		AlphaSectionID:    alphaSectionID,
		BetaSectionID:     betaSectionID,
		OriginalVariantID: originalVariantID,
		NewVariantID:      newVariantID,
	}
}

func currentCallablePayloadForWatchCodeTest(project Project, sectionID string) (map[string]any, error) {
	return project.currentCallableSectionPayload(sectionID)
}

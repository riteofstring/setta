package project

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestStoreCompletesCallableWithoutMutatingCanonicalState(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	before := store.Snapshot()
	beforeCode := writer.code
	provider.completionResolver = func(
		ctx context.Context,
		request CallableCompletionRequest,
	) ([]CompletionItem, error) {
		if ctx == nil {
			t.Fatal("CompleteCallable() context = nil")
		}
		want := CallableCompletionRequest{
			ProjectID:          initialProjectID,
			SectionID:          squareRootCallableID,
			CanonicalCode:      before.GeneratedCode.Code,
			AuthoredExpression: "math.sq",
			CursorOffsetUTF16:  7,
		}
		if !reflect.DeepEqual(request, want) {
			t.Fatalf("completion request = %#v, want %#v", request, want)
		}
		return []CompletionItem{{Label: "sqrt", InsertText: "sqrt"}}, nil
	}

	items, err := store.CompleteCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sq",
		7,
	)
	if err != nil {
		t.Fatalf("CompleteCallable() error = %v", err)
	}
	if want := []CompletionItem{{Label: "sqrt", InsertText: "sqrt"}}; !reflect.DeepEqual(items, want) {
		t.Fatalf("completion items = %#v, want %#v", items, want)
	}
	if provider.completionCalls != 1 || provider.resolveCalls != 0 || provider.synchronizeCalls != 0 {
		t.Fatalf(
			"provider calls = complete %d, resolve %d, synchronize %d; want 1, 0, 0",
			provider.completionCalls,
			provider.resolveCalls,
			provider.synchronizeCalls,
		)
	}
	if len(writer.writes) != 1 {
		t.Fatalf("generated-file writes = %d, want initial write only", len(writer.writes))
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func TestStoreRejectsInvalidCallableCompletionInputsWithoutCallingProvider(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	before := store.Snapshot()
	beforeCode := writer.code

	for _, testCase := range []struct {
		name      string
		projectID string
		sectionID string
		draft     string
		cursor    int
		wantError error
	}{
		{name: "unknown project", projectID: "project:unknown", sectionID: squareRootCallableID, draft: "math.sq", cursor: 7, wantError: ErrProjectNotFound},
		{name: "unknown section", projectID: initialProjectID, sectionID: "callable:unknown", draft: "math.sq", cursor: 7, wantError: ErrCallableSectionNotFound},
		{name: "blank draft", projectID: initialProjectID, sectionID: squareRootCallableID, draft: " \t", cursor: 1, wantError: ErrCallableCompletionInvalid},
		{name: "line break", projectID: initialProjectID, sectionID: squareRootCallableID, draft: "math.sq\nmath.sqrt", cursor: 7, wantError: ErrCallableCompletionInvalid},
		{name: "null byte", projectID: initialProjectID, sectionID: squareRootCallableID, draft: "math.sq\x00", cursor: 7, wantError: ErrCallableCompletionInvalid},
		{name: "oversized draft", projectID: initialProjectID, sectionID: squareRootCallableID, draft: strings.Repeat("a", maxAuthoredExpressionBytes+1), cursor: 1, wantError: ErrCallableCompletionInvalid},
		{name: "negative cursor", projectID: initialProjectID, sectionID: squareRootCallableID, draft: "math.sq", cursor: -1, wantError: ErrCallableCompletionInvalid},
		{name: "cursor past end", projectID: initialProjectID, sectionID: squareRootCallableID, draft: "math.sq", cursor: 8, wantError: ErrCallableCompletionInvalid},
		{name: "cursor in surrogate pair", projectID: initialProjectID, sectionID: squareRootCallableID, draft: "math.😀", cursor: 6, wantError: ErrCallableCompletionInvalid},
		{name: "invalid UTF-8", projectID: initialProjectID, sectionID: squareRootCallableID, draft: string([]byte{0xff}), cursor: 0, wantError: ErrCallableCompletionInvalid},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := store.CompleteCallable(
				context.Background(),
				testCase.projectID,
				testCase.sectionID,
				testCase.draft,
				testCase.cursor,
			)
			if !errors.Is(err, testCase.wantError) {
				t.Fatalf("CompleteCallable() error = %v, want %v", err, testCase.wantError)
			}
			requireUnchangedStore(t, store, writer, before, beforeCode)
		})
	}
	if provider.completionCalls != 0 {
		t.Fatalf("completion provider calls = %d, want none", provider.completionCalls)
	}
}

func TestStoreLeavesCanonicalStateUntouchedWhenCallableCompletionFails(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	before := store.Snapshot()
	beforeCode := writer.code
	providerErr := errors.New("completion unavailable")
	provider.completionResolver = func(context.Context, CallableCompletionRequest) ([]CompletionItem, error) {
		return nil, providerErr
	}

	_, err := store.CompleteCallable(
		context.Background(),
		initialProjectID,
		squareRootCallableID,
		"math.sq",
		7,
	)
	if !errors.Is(err, providerErr) || !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("CompleteCallable() error = %v, want provider-unavailable completion failure", err)
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func TestStoreReleasesProjectLockBeforeWaitingForCallableCompletion(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	returned := false
	defer func() {
		if !returned {
			close(release)
		}
	}()
	provider.completionResolver = func(context.Context, CallableCompletionRequest) ([]CompletionItem, error) {
		close(started)
		<-release
		return []CompletionItem{}, nil
	}

	completionDone := make(chan error, 1)
	go func() {
		_, err := store.CompleteCallable(
			context.Background(),
			initialProjectID,
			squareRootCallableID,
			"math.sq",
			7,
		)
		completionDone <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("completion provider did not begin")
	}

	snapshotDone := make(chan struct{})
	go func() {
		_ = store.Snapshot()
		close(snapshotDone)
	}()
	select {
	case <-snapshotDone:
	case <-time.After(time.Second):
		t.Fatal("Snapshot() remained blocked by a completion provider wait")
	}

	close(release)
	returned = true
	select {
	case err := <-completionDone:
		if err != nil {
			t.Fatalf("CompleteCallable() error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("CompleteCallable() did not return after its provider released")
	}
}

func TestStoreCompletesBothPythonTargetRegionsWithoutMutatingCanonicalState(t *testing.T) {
	for _, testCase := range []struct {
		name           string
		region         PythonTargetCompletionRegion
		prefix         string
		suffix         string
		cursorUTF16    int
		wantCursorByte int
		wantLabel      string
	}{
		{
			name:           "prefix",
			region:         PythonTargetCompletionPrefix,
			prefix:         "import mat",
			suffix:         "state = SettaState()",
			cursorUTF16:    len("import mat") - 1,
			wantCursorByte: len("import mat") - 1,
			wantLabel:      "math",
		},
		{
			name:        "suffix",
			region:      PythonTargetCompletionSuffix,
			prefix:      "import math",
			suffix:      "state = SettaSta",
			cursorUTF16: len("state = SettaSta") - 1,
			wantLabel:   "SettaState",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
			store, provider := newStoreForTest(t, writer, nil)
			before := store.Snapshot()
			beforeCode := writer.code
			wantCode := testCase.prefix + "\n\n" + before.GeneratedCode.Body + "\n\n" + testCase.suffix
			if testCase.region == PythonTargetCompletionSuffix {
				testCase.wantCursorByte = len(wantCode) - len(testCase.suffix) + testCase.cursorUTF16
			}
			provider.targetCompletionResolver = func(
				ctx context.Context,
				request PythonTargetCompletionRequest,
			) ([]CompletionItem, error) {
				if ctx == nil {
					t.Fatal("CompletePythonTarget() context = nil")
				}
				if request.Code != wantCode || request.CursorOffsetByte != testCase.wantCursorByte {
					t.Fatalf("target completion request = %#v, want code %q and byte offset %d", request, wantCode, testCase.wantCursorByte)
				}
				return []CompletionItem{{Label: testCase.wantLabel, InsertText: testCase.wantLabel}}, nil
			}

			items, err := store.CompletePythonTarget(
				context.Background(),
				initialProjectID,
				testCase.region,
				testCase.prefix,
				testCase.suffix,
				testCase.cursorUTF16,
			)
			if err != nil {
				t.Fatalf("CompletePythonTarget() error = %v", err)
			}
			if want := []CompletionItem{{Label: testCase.wantLabel, InsertText: testCase.wantLabel}}; !reflect.DeepEqual(items, want) {
				t.Fatalf("target completion items = %#v, want %#v", items, want)
			}
			if provider.targetCompletionCalls != 1 || provider.completionCalls != 0 || provider.synchronizeCalls != 0 {
				t.Fatalf("provider calls = target %d, callable %d, synchronize %d; want 1, 0, 0", provider.targetCompletionCalls, provider.completionCalls, provider.synchronizeCalls)
			}
			requireUnchangedStore(t, store, writer, before, beforeCode)
		})
	}
}

func TestStoreRejectsInvalidPythonTargetCompletionInputsAndLeavesStateUntouched(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	before := store.Snapshot()
	beforeCode := writer.code
	for _, testCase := range []struct {
		name        string
		projectID   string
		region      PythonTargetCompletionRegion
		prefix      string
		suffix      string
		cursorUTF16 int
		want        error
	}{
		{name: "unknown project", projectID: "project:missing", region: PythonTargetCompletionPrefix, prefix: "import math", suffix: "state = SettaState()", cursorUTF16: 1, want: ErrProjectNotFound},
		{name: "unknown region", projectID: initialProjectID, region: "body", prefix: "import math", suffix: "state = SettaState()", cursorUTF16: 1, want: ErrPythonTargetCompletionInvalid},
		{name: "invalid prefix", projectID: initialProjectID, region: PythonTargetCompletionPrefix, prefix: strings.Repeat("a", maxPythonTargetBytes+1), suffix: "state = SettaState()", cursorUTF16: 1, want: ErrPythonTargetCompletionInvalid},
		{name: "invalid UTF-8 suffix", projectID: initialProjectID, region: PythonTargetCompletionSuffix, prefix: "import math", suffix: string([]byte{0xff}), cursorUTF16: 0, want: ErrPythonTargetCompletionInvalid},
		{name: "surrogate midpoint", projectID: initialProjectID, region: PythonTargetCompletionPrefix, prefix: "import 😀", suffix: "state = SettaState()", cursorUTF16: 8, want: ErrPythonTargetCompletionInvalid},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := store.CompletePythonTarget(context.Background(), testCase.projectID, testCase.region, testCase.prefix, testCase.suffix, testCase.cursorUTF16)
			if !errors.Is(err, testCase.want) {
				t.Fatalf("CompletePythonTarget() error = %v, want %v", err, testCase.want)
			}
			requireUnchangedStore(t, store, writer, before, beforeCode)
		})
	}
	if provider.targetCompletionCalls != 0 {
		t.Fatalf("target completion provider calls = %d, want none", provider.targetCompletionCalls)
	}
}

func TestStoreCancelsPythonTargetCompletionBeforeItCallsTheProvider(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	before := store.Snapshot()
	beforeCode := writer.code
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := store.CompletePythonTarget(
		ctx,
		initialProjectID,
		PythonTargetCompletionPrefix,
		"import mat",
		"state = SettaState()",
		9,
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("CompletePythonTarget() error = %v, want context cancellation", err)
	}
	if provider.targetCompletionCalls != 0 {
		t.Fatalf("target completion provider calls = %d, want none", provider.targetCompletionCalls)
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func TestStoreReleasesProjectLockAndLeavesStateUntouchedWhenPythonTargetCompletionFails(t *testing.T) {
	writer := &memoryGeneratedFileWriter{path: "/temporary/setta_gen.py"}
	store, provider := newStoreForTest(t, writer, nil)
	before := store.Snapshot()
	beforeCode := writer.code
	started := make(chan struct{})
	release := make(chan struct{})
	provider.targetCompletionResolver = func(context.Context, PythonTargetCompletionRequest) ([]CompletionItem, error) {
		close(started)
		<-release
		return nil, errors.New("target completion unavailable")
	}
	result := make(chan error, 1)
	go func() {
		_, err := store.CompletePythonTarget(context.Background(), initialProjectID, PythonTargetCompletionPrefix, "import mat", "state = SettaState()", 9)
		result <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("target completion provider did not begin")
	}
	snapshotDone := make(chan struct{})
	go func() {
		_ = store.Snapshot()
		close(snapshotDone)
	}()
	select {
	case <-snapshotDone:
	case <-time.After(time.Second):
		t.Fatal("Snapshot() remained blocked by a target completion provider wait")
	}
	close(release)
	if err := <-result; !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("CompletePythonTarget() error = %v, want provider-unavailable failure", err)
	}
	requireUnchangedStore(t, store, writer, before, beforeCode)
}

func TestByteOffsetForUTF16OffsetRejectsSurrogateMidpoints(t *testing.T) {
	value := "a😀β"
	for _, testCase := range []struct {
		offset int
		want   int
	}{
		{offset: 0, want: 0},
		{offset: 1, want: 1},
		{offset: 3, want: 5},
		{offset: 4, want: len(value)},
	} {
		got, err := ByteOffsetForUTF16Offset(value, testCase.offset)
		if err != nil {
			t.Fatalf("ByteOffsetForUTF16Offset(%d) error = %v", testCase.offset, err)
		}
		if got != testCase.want {
			t.Fatalf("ByteOffsetForUTF16Offset(%d) = %d, want %d", testCase.offset, got, testCase.want)
		}
	}
	if _, err := ByteOffsetForUTF16Offset(value, 2); !errors.Is(err, ErrCallableCompletionInvalid) {
		t.Fatalf("ByteOffsetForUTF16Offset() error = %v, want surrogate-boundary failure", err)
	}
}

type completionResolverFunc func(context.Context, CallableCompletionRequest) ([]CompletionItem, error)

type pythonTargetCompletionResolverFunc func(context.Context, PythonTargetCompletionRequest) ([]CompletionItem, error)

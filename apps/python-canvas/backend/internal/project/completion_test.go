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
	) ([]CallableCompletionItem, error) {
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
		return []CallableCompletionItem{{Label: "sqrt", InsertText: "sqrt"}}, nil
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
	if want := []CallableCompletionItem{{Label: "sqrt", InsertText: "sqrt"}}; !reflect.DeepEqual(items, want) {
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
	provider.completionResolver = func(context.Context, CallableCompletionRequest) ([]CallableCompletionItem, error) {
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
	provider.completionResolver = func(context.Context, CallableCompletionRequest) ([]CallableCompletionItem, error) {
		close(started)
		<-release
		return []CallableCompletionItem{}, nil
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

type completionResolverFunc func(context.Context, CallableCompletionRequest) ([]CallableCompletionItem, error)

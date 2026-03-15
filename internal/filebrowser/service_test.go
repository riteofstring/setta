package filebrowser

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/auth"
	binarypayload "setta/internal/binary"
	"setta/internal/config"
)

type testSessionProvider struct {
	current *auth.CurrentSession
}

func (p testSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func TestServiceListFolderFiltersAndIncludesSettaInitialization(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	runtimeRoot := filepath.Join(root, "runtime-root")
	globalSettaFilesBase := filepath.Join(root, ".setta", "setta_files")
	for _, path := range []string{workspaceRoot, settaFilesRoot, runtimeRoot, globalSettaFilesBase} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:        workspaceRoot,
		SettaFilesRoot:       settaFilesRoot,
		RuntimeRoot:          runtimeRoot,
		GlobalSettaFilesBase: globalSettaFilesBase,
		BinaryStore:          binaryStore,
		Sessions:             testSessionProvider{current: &auth.CurrentSession{Secret: []byte("test-secret")}},
	})
	if err != nil {
		t.Fatalf("new file browser service: %v", err)
	}

	visibleFolder := filepath.Join(workspaceRoot, "child")
	initializedLocal := filepath.Join(workspaceRoot, "initialized-local")
	initializedGlobal := filepath.Join(workspaceRoot, "initialized-global")
	userRuntime := filepath.Join(workspaceRoot, "runtime")
	if err := os.MkdirAll(visibleFolder, 0o755); err != nil {
		t.Fatalf("mkdir child: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(initializedLocal, "setta_files"), 0o755); err != nil {
		t.Fatalf("mkdir initialized local: %v", err)
	}
	if err := os.MkdirAll(initializedGlobal, 0o755); err != nil {
		t.Fatalf("mkdir initialized global: %v", err)
	}
	if err := os.MkdirAll(config.BuildFilesRootFromBase(globalSettaFilesBase, initializedGlobal), 0o755); err != nil {
		t.Fatalf("mkdir global initialized root: %v", err)
	}
	if err := os.MkdirAll(userRuntime, 0o755); err != nil {
		t.Fatalf("mkdir user runtime: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "node_modules"), 0o755); err != nil {
		t.Fatalf("mkdir node_modules: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(workspaceRoot, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "visible.txt"), []byte("visible"), 0o644); err != nil {
		t.Fatalf("write visible file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, ".env"), []byte("hidden"), 0o644); err != nil {
		t.Fatalf("write hidden file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, ".gitignore"), []byte("dist/\n"), 0o644); err != nil {
		t.Fatalf("write .gitignore: %v", err)
	}

	// Symlinks to Setta-managed roots should stay hidden from the browser view.
	linkPath := filepath.Join(workspaceRoot, "setta-state-link")
	if err := os.Symlink(settaFilesRoot, linkPath); err != nil && !os.IsExist(err) {
		t.Logf("skipping symlink assertion: %v", err)
		linkPath = ""
	}

	items, err := service.ListFolder(context.Background(), ListFolderRequest{
		FolderPath:              workspaceRoot,
		IncludeSettaInitialized: true,
	})
	if err != nil {
		t.Fatalf("list folder: %v", err)
	}

	names := make(map[string]FolderContentItem, len(items))
	for _, item := range items {
		names[item.Name] = item
	}
	if _, ok := names["child"]; !ok {
		t.Fatalf("expected child folder in listing, got %#v", items)
	}
	if _, ok := names["runtime"]; !ok {
		t.Fatalf("expected user runtime folder to stay visible, got %#v", items)
	}
	if _, ok := names["visible.txt"]; !ok {
		t.Fatalf("expected visible file in listing, got %#v", items)
	}
	if _, ok := names["node_modules"]; ok {
		t.Fatalf("expected ignored folder to be hidden, got %#v", items)
	}
	if _, ok := names[".env"]; !ok {
		t.Fatalf("expected dotfile to stay visible by default, got %#v", items)
	}
	if _, ok := names[".gitignore"]; !ok {
		t.Fatalf("expected dotfile to stay visible by default, got %#v", items)
	}
	if _, ok := names["setta_files"]; ok {
		t.Fatalf("expected internal setta_files root to be hidden, got %#v", items)
	}
	if _, ok := names[".git"]; ok {
		t.Fatalf("expected ignored .git root to stay hidden, got %#v", items)
	}
	if linkPath != "" {
		if _, ok := names["setta-state-link"]; ok {
			t.Fatalf("expected symlinked internal root to be hidden, got %#v", items)
		}
	}
	if value := names["initialized-local"].IsSettaInitialized; value == nil || !*value {
		t.Fatalf("expected initialized-local flag, got %#v", names["initialized-local"])
	}
	if value := names["initialized-global"].IsSettaInitialized; value == nil || !*value {
		t.Fatalf("expected initialized-global flag, got %#v", names["initialized-global"])
	}
}

func TestServiceReadWriteAndDownloadFlow(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	runtimeRoot := filepath.Join(root, "runtime-root")
	globalSettaFilesBase := filepath.Join(root, ".setta", "setta_files")
	for _, path := range []string{workspaceRoot, settaFilesRoot, runtimeRoot, globalSettaFilesBase} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:        workspaceRoot,
		SettaFilesRoot:       settaFilesRoot,
		RuntimeRoot:          runtimeRoot,
		GlobalSettaFilesBase: globalSettaFilesBase,
		BinaryStore:          binaryStore,
		Sessions:             testSessionProvider{current: &auth.CurrentSession{Secret: []byte("test-secret")}},
		TimeNow: func() time.Time {
			return time.Unix(1_730_000_000, 0).UTC()
		},
	})
	if err != nil {
		t.Fatalf("new file browser service: %v", err)
	}

	filePath := filepath.Join(workspaceRoot, "notes.csv")
	if err := os.WriteFile(filePath, []byte("a,b\n1,2\n"), 0o644); err != nil {
		t.Fatalf("write seed file: %v", err)
	}

	// ReadFileContent should snapshot the file into the binary store instead of inlining bytes.
	readResult, err := service.ReadFileContent(context.Background(), FileContentRequest{Path: filePath})
	if err != nil {
		t.Fatalf("read file content: %v", err)
	}
	content, err := binaryStore.ReadBytes(readResult.ContentID)
	if err != nil {
		t.Fatalf("read stored binary payload: %v", err)
	}
	if string(content) != "a,b\n1,2\n" {
		t.Fatalf("unexpected stored content %q", string(content))
	}

	updatedRef, err := binaryStore.StoreBytes([]byte("a,b\n1,9\n"), "text/csv", false)
	if err != nil {
		t.Fatalf("store updated payload: %v", err)
	}
	writeResult, err := service.WriteFileContent(context.Background(), WriteFileContentRequest{
		Path:            filePath,
		ContentID:       updatedRef.ContentID,
		ExpectedMtimeNs: &readResult.MtimeNs,
	})
	if err != nil {
		t.Fatalf("write file content: %v", err)
	}
	if payload, err := os.ReadFile(filePath); err != nil || string(payload) != "a,b\n1,9\n" {
		t.Fatalf("expected updated file contents, got %q err=%v", string(payload), err)
	}
	if writeResult.MimeType != "text/csv" {
		t.Fatalf("expected text/csv, got %q", writeResult.MimeType)
	}

	urls, err := service.BuildDownloadURLs(context.Background(), FileBrowserDownloadURLRequest{
		Paths: []string{filePath},
	}, func(token string) string {
		return "http://example.com/api/fileBrowser/" + token
	})
	if err != nil {
		t.Fatalf("build download urls: %v", err)
	}
	if len(urls) != 1 {
		t.Fatalf("expected one download url, got %#v", urls)
	}
	if urls[0].Path != filePath {
		t.Fatalf("expected normalized path %q, got %q", filePath, urls[0].Path)
	}
	token := strings.TrimPrefix(urls[0].URL, "http://example.com/api/fileBrowser/")
	downloadResult, err := service.Download(context.Background(), token)
	if err != nil {
		t.Fatalf("download file: %v", err)
	}
	if downloadResult.Path != filePath {
		t.Fatalf("expected download path %q, got %q", filePath, downloadResult.Path)
	}
	if downloadResult.MediaType != "text/csv" {
		t.Fatalf("expected text/csv download media type, got %q", downloadResult.MediaType)
	}
}

func TestServiceTransferCopyRenamesConflictsAndRejectsNestedMoves(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	runtimeRoot := filepath.Join(root, "runtime-root")
	globalSettaFilesBase := filepath.Join(root, ".setta", "setta_files")
	for _, path := range []string{workspaceRoot, settaFilesRoot, runtimeRoot, globalSettaFilesBase} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	binaryStore, err := binarypayload.NewStore(filepath.Join(root, "binary"))
	if err != nil {
		t.Fatalf("new binary store: %v", err)
	}
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:        workspaceRoot,
		SettaFilesRoot:       settaFilesRoot,
		RuntimeRoot:          runtimeRoot,
		GlobalSettaFilesBase: globalSettaFilesBase,
		BinaryStore:          binaryStore,
		Sessions:             testSessionProvider{current: &auth.CurrentSession{Secret: []byte("test-secret")}},
	})
	if err != nil {
		t.Fatalf("new file browser service: %v", err)
	}

	sourceFile := filepath.Join(workspaceRoot, "notes.csv")
	if err := os.WriteFile(sourceFile, []byte("task,status\nalpha,todo\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "notes copy.csv"), []byte("existing"), 0o644); err != nil {
		t.Fatalf("write conflicting copy: %v", err)
	}

	copyResult, err := service.Transfer(context.Background(), TransferRequest{
		SourcePath:            sourceFile,
		DestinationFolderPath: workspaceRoot,
		Operation:             TransferOperationCopy,
	})
	if err != nil {
		t.Fatalf("copy transfer: %v", err)
	}
	expectedCopyPath := filepath.Join(workspaceRoot, "notes copy 2.csv")
	if copyResult.DestinationPath != expectedCopyPath {
		t.Fatalf("expected auto-renamed copy path %q, got %q", expectedCopyPath, copyResult.DestinationPath)
	}
	if payload, err := os.ReadFile(expectedCopyPath); err != nil || string(payload) != "task,status\nalpha,todo\n" {
		t.Fatalf("expected copied file contents, got %q err=%v", string(payload), err)
	}

	sourceFolder := filepath.Join(workspaceRoot, "assets")
	nestedDestination := filepath.Join(sourceFolder, "inner")
	if err := os.MkdirAll(nestedDestination, 0o755); err != nil {
		t.Fatalf("mkdir nested destination: %v", err)
	}
	_, err = service.Transfer(context.Background(), TransferRequest{
		SourcePath:            sourceFolder,
		DestinationFolderPath: nestedDestination,
		Operation:             TransferOperationMove,
	})
	if err == nil {
		t.Fatal("expected nested folder move to fail")
	}
	var routeErr *Error
	if !strings.Contains(err.Error(), "Cannot move or copy a folder into itself.") || !errors.As(err, &routeErr) || routeErr.Kind != ErrorInvalidRequest {
		t.Fatalf("expected nested folder rejection, got %#v", err)
	}
}

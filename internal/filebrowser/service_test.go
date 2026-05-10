package filebrowser

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
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

	fixture := newListFolderInitializationFixture(t)
	linkPath := seedListFolderInitializationEntries(t, fixture)

	response, err := fixture.service.ListFolder(context.Background(), ListFolderRequest{
		FolderPath:              fixture.workspaceRoot,
		IncludeSettaInitialized: true,
	})
	if err != nil {
		t.Fatalf("list folder: %v", err)
	}

	names := folderItemNames(response.Items)
	assertFolderListingContains(t, names, response.Items, "child", "runtime", "visible.txt", ".env", ".gitignore")
	assertFolderListingExcludes(t, names, response.Items, "node_modules", "setta_files", ".git")
	if linkPath != "" {
		assertFolderListingExcludes(t, names, response.Items, "setta-state-link")
	}
	assertSettaInitializedFlag(t, names, "initialized-local")
	assertSettaInitializedFlag(t, names, "initialized-global")
}

type listFolderInitializationFixture struct {
	service              *Service
	workspaceRoot        string
	settaFilesRoot       string
	globalSettaFilesBase string
}

func newListFolderInitializationFixture(t *testing.T) listFolderInitializationFixture {
	t.Helper()

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
	return listFolderInitializationFixture{
		service:              service,
		workspaceRoot:        workspaceRoot,
		settaFilesRoot:       settaFilesRoot,
		globalSettaFilesBase: globalSettaFilesBase,
	}
}

func seedListFolderInitializationEntries(t *testing.T, fixture listFolderInitializationFixture) string {
	t.Helper()

	visibleFolder := filepath.Join(fixture.workspaceRoot, "child")
	initializedLocal := filepath.Join(fixture.workspaceRoot, "initialized-local")
	initializedGlobal := filepath.Join(fixture.workspaceRoot, "initialized-global")
	userRuntime := filepath.Join(fixture.workspaceRoot, "runtime")
	if err := os.MkdirAll(visibleFolder, 0o755); err != nil {
		t.Fatalf("mkdir child: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(initializedLocal, "setta_files"), 0o755); err != nil {
		t.Fatalf("mkdir initialized local: %v", err)
	}
	if err := os.MkdirAll(initializedGlobal, 0o755); err != nil {
		t.Fatalf("mkdir initialized global: %v", err)
	}
	if err := os.MkdirAll(config.BuildFilesRootFromBase(fixture.globalSettaFilesBase, initializedGlobal), 0o755); err != nil {
		t.Fatalf("mkdir global initialized root: %v", err)
	}
	if err := os.MkdirAll(userRuntime, 0o755); err != nil {
		t.Fatalf("mkdir user runtime: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(fixture.workspaceRoot, "node_modules"), 0o755); err != nil {
		t.Fatalf("mkdir node_modules: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(fixture.workspaceRoot, ".git"), 0o755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fixture.workspaceRoot, "visible.txt"), []byte("visible"), 0o644); err != nil {
		t.Fatalf("write visible file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fixture.workspaceRoot, ".env"), []byte("hidden"), 0o644); err != nil {
		t.Fatalf("write hidden file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(fixture.workspaceRoot, ".gitignore"), []byte("dist/\n"), 0o644); err != nil {
		t.Fatalf("write .gitignore: %v", err)
	}

	// Symlinks to Setta-managed roots should stay hidden from the browser view.
	linkPath := filepath.Join(fixture.workspaceRoot, "setta-state-link")
	if err := os.Symlink(fixture.settaFilesRoot, linkPath); err != nil && !os.IsExist(err) {
		t.Logf("skipping symlink assertion: %v", err)
		return ""
	}
	return linkPath
}

func folderItemNames(items []FolderContentItem) map[string]FolderContentItem {
	names := make(map[string]FolderContentItem, len(items))
	for _, item := range items {
		names[item.Name] = item
	}
	return names
}

func assertFolderListingContains(t *testing.T, names map[string]FolderContentItem, items []FolderContentItem, expectedNames ...string) {
	t.Helper()

	for _, expectedName := range expectedNames {
		if _, ok := names[expectedName]; !ok {
			t.Fatalf("expected %s in listing, got %#v", expectedName, items)
		}
	}
}

func assertFolderListingExcludes(t *testing.T, names map[string]FolderContentItem, items []FolderContentItem, expectedHiddenNames ...string) {
	t.Helper()

	for _, expectedHiddenName := range expectedHiddenNames {
		if _, ok := names[expectedHiddenName]; ok {
			t.Fatalf("expected %s to be hidden, got %#v", expectedHiddenName, items)
		}
	}
}

func assertSettaInitializedFlag(t *testing.T, names map[string]FolderContentItem, name string) {
	t.Helper()

	if value := names[name].IsSettaInitialized; value == nil || !*value {
		t.Fatalf("expected %s flag, got %#v", name, names[name])
	}
}

func TestServiceListFolderAppliesEntryCapAfterFolderFirstCaseInsensitiveSortAndIncludesMtime(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	folderPath := filepath.Join(workspaceRoot, "z-folder")
	if err := os.MkdirAll(folderPath, 0o755); err != nil {
		t.Fatalf("mkdir folder: %v", err)
	}
	for _, name := range []string{"B-file.txt", "a-file.txt"} {
		if err := os.WriteFile(filepath.Join(workspaceRoot, name), []byte(name), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	maxEntries := 2
	response, err := service.ListFolder(context.Background(), ListFolderRequest{
		FolderPath:     workspaceRoot,
		MaxEntries:     &maxEntries,
		IncludeMtime:   true,
		IncludeSize:    false,
		IgnorePatterns: []string{},
	})
	if err != nil {
		t.Fatalf("list folder: %v", err)
	}
	items := response.Items
	if len(items) != 2 {
		t.Fatalf("expected two listed items, got %#v", items)
	}

	if items[0].Type != "folder" || items[0].Name != "z-folder" {
		t.Fatalf("expected folder-first sort to keep z-folder first under cap, got %#v", items)
	}
	if items[0].FullPath != folderPath {
		t.Fatalf("expected normalized folder fullPath %q, got %q", folderPath, items[0].FullPath)
	}
	if items[0].Mtime == nil {
		t.Fatalf("expected folder mtime to be included, got %#v", items[0])
	}

	secondPath := filepath.Join(workspaceRoot, "a-file.txt")
	if items[1].Type != "file" || items[1].Name != "a-file.txt" {
		t.Fatalf("expected case-insensitive file sort to keep a-file.txt second, got %#v", items)
	}
	if items[1].FullPath != secondPath {
		t.Fatalf("expected normalized file fullPath %q, got %q", secondPath, items[1].FullPath)
	}
	if items[1].Mtime == nil {
		t.Fatalf("expected file mtime to be included, got %#v", items[1])
	}
}

func TestServiceListFolderReturnsEmptyListForMissingFolderWhenRequested(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)
	missingFolder := filepath.Join(workspaceRoot, "missing-folder")

	response, err := service.ListFolder(context.Background(), ListFolderRequest{
		FolderPath:            missingFolder,
		MissingFolderBehavior: "empty",
	})
	if err != nil {
		t.Fatalf("list missing folder with empty behavior: %v", err)
	}
	if response.FolderPath != missingFolder {
		t.Fatalf("expected resolved missing folder path %q, got %q", missingFolder, response.FolderPath)
	}
	items := response.Items
	if len(items) != 0 {
		t.Fatalf("expected empty list for missing folder, got %#v", items)
	}
}

func TestServiceListFolderResolvesRelativePathsAgainstBaseFolder(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	baseFolder := filepath.Join(workspaceRoot, "nested")
	childFolder := filepath.Join(baseFolder, "child")
	if err := os.MkdirAll(childFolder, 0o755); err != nil {
		t.Fatalf("mkdir child folder: %v", err)
	}

	response, err := service.ListFolder(context.Background(), ListFolderRequest{
		BaseFolderPath:        workspaceRoot,
		FolderPath:            "nested",
		MissingFolderBehavior: "empty",
	})
	if err != nil {
		t.Fatalf("list folder relative to base: %v", err)
	}
	if response.FolderPath != baseFolder {
		t.Fatalf("expected resolved folder path %q, got %q", baseFolder, response.FolderPath)
	}
	if len(response.Items) != 1 || response.Items[0].FullPath != childFolder {
		t.Fatalf("expected child folder listing under %q, got %#v", baseFolder, response.Items)
	}

	baseResponse, err := service.ListFolder(context.Background(), ListFolderRequest{
		BaseFolderPath:        baseFolder,
		FolderPath:            "",
		MissingFolderBehavior: "empty",
	})
	if err != nil {
		t.Fatalf("list base folder with empty input: %v", err)
	}
	if baseResponse.FolderPath != baseFolder {
		t.Fatalf("expected empty input to resolve to base folder %q, got %q", baseFolder, baseResponse.FolderPath)
	}
}

func TestServiceWorkspacePythonSignalUsesGoOwnedRootDetection(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	if err := os.WriteFile(filepath.Join(workspaceRoot, "README.md"), []byte("docs"), 0o644); err != nil {
		t.Fatalf("write readme: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "pyproject.toml"), []byte("[project]\nname = \"demo\"\n"), 0o644); err != nil {
		t.Fatalf("write pyproject: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(workspaceRoot, ".venv"), 0o755); err != nil {
		t.Fatalf("mkdir .venv: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, ".venv", "ignored.py"), []byte("print('ignored')\n"), 0o644); err != nil {
		t.Fatalf("write ignored venv file: %v", err)
	}

	response, err := service.WorkspacePythonSignal(context.Background(), workspaceRoot)
	if err != nil {
		t.Fatalf("workspace python signal: %v", err)
	}
	if response.FolderPath != workspaceRoot {
		t.Fatalf("expected normalized folder path %q, got %q", workspaceRoot, response.FolderPath)
	}
	if !response.HasPython {
		t.Fatal("expected pyproject.toml to mark the workspace as Python-backed")
	}

	nonPythonRoot := filepath.Join(workspaceRoot, "frontend-only")
	if err := os.MkdirAll(nonPythonRoot, 0o755); err != nil {
		t.Fatalf("mkdir non-python root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(nonPythonRoot, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatalf("write package.json: %v", err)
	}

	nonPythonResponse, err := service.WorkspacePythonSignal(context.Background(), nonPythonRoot)
	if err != nil {
		t.Fatalf("workspace python signal for non-python root: %v", err)
	}
	if nonPythonResponse.HasPython {
		t.Fatal("expected non-python root to stay false")
	}
}

func TestServiceReadWriteAndDownloadFlow(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, binaryStore, _ := newTestFileBrowserService(t, func() time.Time {
		return time.Unix(1_730_000_000, 0).UTC()
	})

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

func TestServiceBuildDownloadURLsSkipsInvalidPaths(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	validPath := filepath.Join(workspaceRoot, "notes.txt")
	if err := os.WriteFile(validPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write valid download file: %v", err)
	}
	directoryPath := filepath.Join(workspaceRoot, "folder")
	if err := os.MkdirAll(directoryPath, 0o755); err != nil {
		t.Fatalf("mkdir directory path: %v", err)
	}
	outsidePath := filepath.Join(t.TempDir(), "outside.txt")
	if err := os.WriteFile(outsidePath, []byte("outside"), 0o644); err != nil {
		t.Fatalf("write outside path: %v", err)
	}

	urls, err := service.BuildDownloadURLs(context.Background(), FileBrowserDownloadURLRequest{
		Paths: []string{
			validPath,
			filepath.Join(workspaceRoot, "missing.txt"),
			directoryPath,
			outsidePath,
			"   ",
		},
	}, func(token string) string {
		return "http://example.com/api/fileBrowser/" + token
	})
	if err != nil {
		t.Fatalf("build download urls: %v", err)
	}
	if len(urls) != 1 {
		t.Fatalf("expected only one download url for the valid path, got %#v", urls)
	}
	if urls[0].Path != validPath {
		t.Fatalf("expected surviving download path %q, got %q", validPath, urls[0].Path)
	}
}

func TestServiceListFolderExplicitEmptyIgnorePatternsOverridesDefaultIgnoreSet(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)
	nodeModulesPath := filepath.Join(workspaceRoot, "node_modules")
	if err := os.MkdirAll(nodeModulesPath, 0o755); err != nil {
		t.Fatalf("mkdir node_modules: %v", err)
	}

	defaultResponse, err := service.ListFolder(context.Background(), ListFolderRequest{
		FolderPath: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("list folder with default ignore patterns: %v", err)
	}
	defaultItems := defaultResponse.Items
	for _, item := range defaultItems {
		if item.Name == "node_modules" {
			t.Fatalf("expected default ignore patterns to hide node_modules, got %#v", defaultItems)
		}
	}

	overrideResponse, err := service.ListFolder(context.Background(), ListFolderRequest{
		FolderPath:     workspaceRoot,
		IgnorePatterns: []string{},
	})
	if err != nil {
		t.Fatalf("list folder with explicit empty ignore patterns: %v", err)
	}
	overrideItems := overrideResponse.Items
	foundNodeModules := false
	for _, item := range overrideItems {
		if item.Name == "node_modules" {
			foundNodeModules = true
			break
		}
	}
	if !foundNodeModules {
		t.Fatalf("expected explicit empty ignore patterns to re-expose node_modules, got %#v", overrideItems)
	}
}

func TestServiceReadFileContentRejectsOversizeAndConcurrentChange(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	smallFilePath := filepath.Join(workspaceRoot, "small.txt")
	if err := os.WriteFile(smallFilePath, []byte("too large"), 0o644); err != nil {
		t.Fatalf("write small file: %v", err)
	}

	maxBytes := int64(4)
	_, err := service.ReadFileContent(context.Background(), FileContentRequest{
		Path:     smallFilePath,
		MaxBytes: &maxBytes,
	})
	if err == nil {
		t.Fatal("expected oversize read to fail")
	}
	var routeErr *Error
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorTooLarge {
		t.Fatalf("expected too_large error, got %#v", err)
	}

	changingFilePath := filepath.Join(workspaceRoot, "changing.bin")
	changingFileSize := DefaultMaxFileContentBytes - 2048
	if err := os.WriteFile(changingFilePath, bytes.Repeat([]byte("x"), int(changingFileSize)), 0o644); err != nil {
		t.Fatalf("write changing file: %v", err)
	}

	stopTouches := make(chan struct{})
	touchStarted := make(chan struct{})
	go func() {
		started := false
		attempt := int64(0)
		for {
			select {
			case <-stopTouches:
				return
			default:
			}
			attempt += 1
			mtime := time.Unix(1_730_000_000, attempt).UTC()
			_ = os.Chtimes(changingFilePath, mtime, mtime)
			if !started {
				close(touchStarted)
				started = true
			}
			runtime.Gosched()
		}
	}()
	<-touchStarted

	readLimit := int64(changingFileSize + 1024)
	conflictSeen := false
	attempts := 0
	deadline := time.Now().Add(2 * time.Second)
	for !conflictSeen && time.Now().Before(deadline) {
		attempts += 1
		_, err = service.ReadFileContent(context.Background(), FileContentRequest{
			Path:     changingFilePath,
			MaxBytes: &readLimit,
		})
		if err == nil {
			runtime.Gosched()
			continue
		}
		if !errors.As(err, &routeErr) {
			close(stopTouches)
			t.Fatalf("expected typed conflict error, got %#v", err)
		}
		if routeErr.Kind != ErrorConflict {
			close(stopTouches)
			t.Fatalf("expected conflict error, got %#v", err)
		}
		conflictSeen = true
	}
	close(stopTouches)
	if !conflictSeen {
		t.Fatalf("expected concurrent change read to fail within retry window after %d attempts", attempts)
	}
}

func TestServiceDownloadURLsAndDownloadsRequireSessionSecret(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)
	service.sessions = testSessionProvider{}

	filePath := filepath.Join(workspaceRoot, "notes.txt")
	if err := os.WriteFile(filePath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write download file: %v", err)
	}

	_, err := service.BuildDownloadURLs(context.Background(), FileBrowserDownloadURLRequest{
		Paths: []string{filePath},
	}, func(token string) string {
		return "http://example.com/api/fileBrowser/" + token
	})
	if err == nil {
		t.Fatal("expected download-url mint to fail without session secret")
	}
	var routeErr *Error
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorTokenUnavailable {
		t.Fatalf("expected token unavailable error for mint, got %#v", err)
	}

	_, err = service.Download(context.Background(), "any-token")
	if err == nil {
		t.Fatal("expected download consume to fail without session secret")
	}
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorTokenUnavailable {
		t.Fatalf("expected token unavailable error for consume, got %#v", err)
	}
}

func TestServiceWriteFileContentEnforcesCreateOnlyAndStaleGuards(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, binaryStore, _ := newTestFileBrowserService(t, nil)

	createRef, err := binaryStore.StoreBytes([]byte("created"), "text/plain", false)
	if err != nil {
		t.Fatalf("store create payload: %v", err)
	}
	createdPath := filepath.Join(workspaceRoot, "created.txt")
	createResult, err := service.WriteFileContent(context.Background(), WriteFileContentRequest{
		Path:      createdPath,
		ContentID: createRef.ContentID,
	})
	if err != nil {
		t.Fatalf("create missing file: %v", err)
	}
	if createResult.Path != createdPath {
		t.Fatalf("expected created path %q, got %q", createdPath, createResult.Path)
	}
	if payload, err := os.ReadFile(createdPath); err != nil || string(payload) != "created" {
		t.Fatalf("expected created file contents, got %q err=%v", string(payload), err)
	}

	_, err = service.WriteFileContent(context.Background(), WriteFileContentRequest{
		Path:      createdPath,
		ContentID: createRef.ContentID,
	})
	if err == nil {
		t.Fatal("expected create-only write to reject existing file")
	}
	var routeErr *Error
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorConflict {
		t.Fatalf("expected create-only conflict, got %#v", err)
	}

	_, err = service.WriteFileContent(context.Background(), WriteFileContentRequest{
		Path:      createdPath,
		ContentID: "missing-content-id",
	})
	if err == nil {
		t.Fatal("expected missing binary payload to fail")
	}
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorBinaryPayloadInvalid {
		t.Fatalf("expected invalid binary payload error, got %#v", err)
	}

	stalePath := filepath.Join(workspaceRoot, "stale.txt")
	if err := os.WriteFile(stalePath, []byte("old"), 0o644); err != nil {
		t.Fatalf("write stale file: %v", err)
	}
	staleInfo, err := os.Stat(stalePath)
	if err != nil {
		t.Fatalf("stat stale file: %v", err)
	}
	updatedMtime := staleInfo.ModTime().Add(2 * time.Second)
	if err := os.Chtimes(stalePath, updatedMtime, updatedMtime); err != nil {
		t.Fatalf("touch stale file: %v", err)
	}
	updateRef, err := binaryStore.StoreBytes([]byte("updated"), "text/plain", false)
	if err != nil {
		t.Fatalf("store update payload: %v", err)
	}
	expectedMtimeNs := staleInfo.ModTime().UnixNano()
	_, err = service.WriteFileContent(context.Background(), WriteFileContentRequest{
		Path:            stalePath,
		ContentID:       updateRef.ContentID,
		ExpectedMtimeNs: &expectedMtimeNs,
	})
	if err == nil {
		t.Fatal("expected stale mtime write to fail")
	}
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorConflict {
		t.Fatalf("expected stale mtime conflict, got %#v", err)
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

func TestServiceTransferMoveReturnsSamePathWhenAlreadyInDestinationFolder(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	sourceFile := filepath.Join(workspaceRoot, "notes.csv")
	if err := os.WriteFile(sourceFile, []byte("task,status\nalpha,todo\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	result, err := service.Transfer(context.Background(), TransferRequest{
		SourcePath:            sourceFile,
		DestinationFolderPath: workspaceRoot,
		Operation:             TransferOperationMove,
	})
	if err != nil {
		t.Fatalf("move within same folder: %v", err)
	}
	if result.SourcePath != sourceFile || result.DestinationPath != sourceFile {
		t.Fatalf("expected same-path move response, got %#v", result)
	}
	if _, err := os.Stat(sourceFile); err != nil {
		t.Fatalf("expected source file to remain in place, got %v", err)
	}
}

func TestServiceTransferMoveRejectsWorkspaceRootAndConflictingDestination(t *testing.T) {
	t.Parallel()

	service, workspaceRoot, _, _ := newTestFileBrowserService(t, nil)

	sourceFile := filepath.Join(workspaceRoot, "notes.csv")
	if err := os.WriteFile(sourceFile, []byte("task,status\nalpha,todo\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	destinationFolder := filepath.Join(workspaceRoot, "archive")
	if err := os.MkdirAll(destinationFolder, 0o755); err != nil {
		t.Fatalf("mkdir destination: %v", err)
	}
	conflictingDestination := filepath.Join(destinationFolder, filepath.Base(sourceFile))
	if err := os.WriteFile(conflictingDestination, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write conflicting destination: %v", err)
	}

	_, err := service.Transfer(context.Background(), TransferRequest{
		SourcePath:            sourceFile,
		DestinationFolderPath: destinationFolder,
		Operation:             TransferOperationMove,
	})
	if err == nil {
		t.Fatal("expected conflicting move destination to fail")
	}
	var routeErr *Error
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorConflict || !strings.Contains(err.Error(), "Destination already exists") {
		t.Fatalf("expected move destination conflict, got %#v", err)
	}

	_, err = service.Transfer(context.Background(), TransferRequest{
		SourcePath:            workspaceRoot,
		DestinationFolderPath: destinationFolder,
		Operation:             TransferOperationMove,
	})
	if err == nil {
		t.Fatal("expected workspace root move to fail")
	}
	if !errors.As(err, &routeErr) || routeErr.Kind != ErrorInvalidRequest || !strings.Contains(err.Error(), "Cannot move or copy the workspace root.") {
		t.Fatalf("expected workspace root rejection, got %#v", err)
	}
}

func newTestFileBrowserService(t *testing.T, timeNow func() time.Time) (*Service, string, *binarypayload.Store, string) {
	t.Helper()

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
		TimeNow:              timeNow,
	})
	if err != nil {
		t.Fatalf("new file browser service: %v", err)
	}
	return service, workspaceRoot, binaryStore, root
}

package evalharness

import (
	"archive/tar"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"sort"
	"strings"

	evalverifier "setta/internal/evalharness/verifier"
)

const phase1FixtureRelativePath = "evals/fixtures/" + ScenarioFixtureTypeScriptService

type phase1FixturePreparation struct {
	root      string
	baseline  string
	workspace string
}

func preparePhase1Fixture(
	ctx context.Context,
	repoRoot string,
) (phase1FixturePreparation, error) {
	snapshot, err := readCommittedPhase1Fixture(ctx, repoRoot)
	if err != nil {
		return phase1FixturePreparation{}, fmt.Errorf("read Phase 1 fixture: %w", err)
	}
	temporaryRoot, err := os.MkdirTemp("", "setta-eval-phase1-fixture-")
	if err != nil {
		return phase1FixturePreparation{}, fmt.Errorf("create Phase 1 fixture copies: %w", err)
	}
	preparation := phase1FixturePreparation{
		root:      temporaryRoot,
		baseline:  filepath.Join(temporaryRoot, "baseline"),
		workspace: filepath.Join(temporaryRoot, "workspace"),
	}
	if err := materializePhase1Fixture(snapshot, preparation.baseline); err != nil {
		return phase1FixturePreparation{}, errors.Join(err, preparation.cleanup())
	}
	if err := materializePhase1Fixture(snapshot, preparation.workspace); err != nil {
		return phase1FixturePreparation{}, errors.Join(err, preparation.cleanup())
	}
	if err := initializePhase1FixtureGit(ctx, preparation); err != nil {
		return phase1FixturePreparation{}, errors.Join(err, preparation.cleanup())
	}
	return preparation, nil
}

func readCommittedPhase1Fixture(
	ctx context.Context,
	repoRoot string,
) (evalverifier.WorkspaceSnapshot, error) {
	command := exec.CommandContext(
		ctx,
		"git",
		"archive",
		"--format=tar",
		"HEAD:"+phase1FixtureRelativePath,
	)
	command.Dir = repoRoot
	diagnostic := newPhase1DiagnosticBuffer(phase0MaxDiagnosticBytes)
	command.Stderr = diagnostic
	archive, err := command.Output()
	if err != nil {
		return nil, fmt.Errorf(
			"read committed fixture tree %s: %w: %s",
			phase1FixtureRelativePath,
			err,
			diagnostic.String(),
		)
	}
	return readPhase1FixtureArchive(archive)
}

func readPhase1FixtureArchive(archive []byte) (evalverifier.WorkspaceSnapshot, error) {
	reader := tar.NewReader(bytes.NewReader(archive))
	state := phase1FixtureArchiveState{snapshot: evalverifier.WorkspaceSnapshot{}}
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("decode committed fixture archive: %w", err)
		}
		if err := state.add(header, reader); err != nil {
			return nil, err
		}
	}
	if len(state.snapshot) == 0 {
		return nil, errors.New("committed fixture tree is empty")
	}
	return state.snapshot, nil
}

type phase1FixtureArchiveState struct {
	snapshot   evalverifier.WorkspaceSnapshot
	totalBytes int64
}

func (state *phase1FixtureArchiveState) add(header *tar.Header, reader io.Reader) error {
	entryPath := strings.TrimSuffix(header.Name, "/")
	if err := validatePhase1FixtureArchivePath(entryPath); err != nil {
		return err
	}
	if header.Typeflag == tar.TypeDir {
		return nil
	}
	if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
		return fmt.Errorf("committed fixture contains non-regular file %s", entryPath)
	}
	if _, exists := state.snapshot[entryPath]; exists {
		return fmt.Errorf("committed fixture contains duplicate file %s", entryPath)
	}
	if err := state.reserve(entryPath, header.Size); err != nil {
		return err
	}
	content, err := readPhase1FixtureArchiveFile(reader, entryPath, header.Size)
	if err != nil {
		return err
	}
	state.snapshot[entryPath] = evalverifier.FileState{
		Content:    content,
		Executable: header.Mode&0o111 != 0,
	}
	return nil
}

func (state *phase1FixtureArchiveState) reserve(entryPath string, size int64) error {
	if len(state.snapshot) >= evalverifier.DefaultMaximumFiles {
		return fmt.Errorf(
			"committed fixture contains more than %d files",
			evalverifier.DefaultMaximumFiles,
		)
	}
	if size < 0 || size > evalverifier.DefaultMaximumFileBytes {
		return fmt.Errorf(
			"committed fixture file %s is %d bytes, maximum is %d",
			entryPath,
			size,
			evalverifier.DefaultMaximumFileBytes,
		)
	}
	state.totalBytes += size
	if state.totalBytes > evalverifier.DefaultMaximumTotalBytes {
		return fmt.Errorf(
			"committed fixture files exceed %d total bytes",
			evalverifier.DefaultMaximumTotalBytes,
		)
	}
	return nil
}

func readPhase1FixtureArchiveFile(reader io.Reader, entryPath string, size int64) ([]byte, error) {
	content, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("read committed fixture file %s: %w", entryPath, err)
	}
	if int64(len(content)) != size {
		return nil, fmt.Errorf("committed fixture file %s was truncated", entryPath)
	}
	return content, nil
}

func validatePhase1FixtureArchivePath(value string) error {
	if value == "" || value == "." || value == ".." || path.IsAbs(value) || path.Clean(value) != value ||
		strings.Contains(value, `\`) || strings.HasPrefix(value, "../") {
		return fmt.Errorf("committed fixture contains invalid path %q", value)
	}
	return nil
}

func materializePhase1Fixture(
	snapshot evalverifier.WorkspaceSnapshot,
	destination string,
) error {
	if err := os.Mkdir(destination, 0o700); err != nil {
		return fmt.Errorf("create Phase 1 fixture copy: %w", err)
	}
	paths := make([]string, 0, len(snapshot))
	for path := range snapshot {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, relative := range paths {
		state := snapshot[relative]
		target := filepath.Join(destination, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return fmt.Errorf("create Phase 1 fixture directory: %w", err)
		}
		mode := os.FileMode(0o600)
		if state.Executable {
			mode = 0o700
		}
		if err := os.WriteFile(target, state.Content, mode); err != nil {
			return fmt.Errorf("write Phase 1 fixture file %s: %w", relative, err)
		}
	}
	return nil
}

func initializePhase1FixtureGit(
	ctx context.Context,
	preparation phase1FixturePreparation,
) error {
	gitHome := filepath.Join(preparation.root, "git-home")
	if err := os.Mkdir(gitHome, 0o700); err != nil {
		return fmt.Errorf("create Phase 1 git home: %w", err)
	}
	environment := []string{
		"GIT_AUTHOR_DATE=2000-01-01T00:00:00Z",
		"GIT_COMMITTER_DATE=2000-01-01T00:00:00Z",
		"GIT_CONFIG_NOSYSTEM=1",
		"HOME=" + gitHome,
		"LANG=C.UTF-8",
		"PATH=" + os.Getenv("PATH"),
		"XDG_CONFIG_HOME=" + gitHome,
	}
	commands := [][]string{
		{"git", "-c", "init.defaultBranch=main", "init"},
		{"git", "-c", "core.hooksPath=/dev/null", "add", "--all"},
		{
			"git",
			"-c", "core.hooksPath=/dev/null",
			"-c", "user.name=Setta Eval",
			"-c", "user.email=setta-eval@example.invalid",
			"commit", "--no-gpg-sign", "-m", "baseline fixture",
		},
	}
	for _, command := range commands {
		if _, err := runPhase0Command(
			ctx,
			preparation.workspace,
			environment,
			command[0],
			command[1:]...,
		); err != nil {
			return fmt.Errorf("initialize disposable Phase 1 fixture git repository: %w", err)
		}
	}
	return nil
}

func (preparation phase1FixturePreparation) cleanup() error {
	if preparation.root == "" {
		return nil
	}
	if err := os.RemoveAll(preparation.root); err != nil {
		return fmt.Errorf("remove Phase 1 fixture copies: %w", err)
	}
	if _, err := os.Stat(preparation.root); !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("Phase 1 fixture copies remain after cleanup")
	}
	return nil
}

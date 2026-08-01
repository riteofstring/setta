package evalharness

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	evalverifier "setta/internal/evalharness/verifier"
)

type phase1FixturePreparation struct {
	root      string
	baseline  string
	workspace string
}

func preparePhase1Fixture(
	ctx context.Context,
	repoRoot string,
) (phase1FixturePreparation, error) {
	fixtureRoot := filepath.Join(repoRoot, "evals", "fixtures", "typescript-service")
	snapshot, err := evalverifier.ReadWorkspace(fixtureRoot, evalverifier.SnapshotOptions{})
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

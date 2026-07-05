package chat

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"setta/internal/codexapp"
)

const (
	codexWorkflowBuilderSkillName = "workflow-builder"
	codexSkillFileName            = "SKILL.md"
)

func normalizeCodexSkillRoots(configured []string) ([]string, error) {
	roots := configured
	if len(roots) == 0 {
		defaultRoot, err := defaultCodexSkillRoot()
		if err != nil {
			return nil, err
		}
		roots = []string{defaultRoot}
	}
	if err := validateCodexSkillRoots(roots); err != nil {
		return nil, err
	}
	return append([]string{}, roots...), nil
}

func defaultCodexSkillRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve default codex skill root working directory: %w", err)
	}
	return findCodexSkillRootFrom(cwd)
}

func findCodexSkillRootFrom(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", fmt.Errorf("resolve codex skill root start %s: %w", start, err)
	}
	for {
		candidate := filepath.Join(dir, ".codex", "skills")
		exists, err := codexWorkflowBuilderSkillExists(candidate)
		if err != nil {
			return "", err
		}
		if exists {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("codex skill root with %s/%s was not found from %s", codexWorkflowBuilderSkillName, codexSkillFileName, start)
}

func validateCodexSkillRoots(roots []string) error {
	if len(roots) == 0 {
		return errors.New("codex skill roots are required")
	}
	workflowBuilderFound := false
	for _, root := range roots {
		if root == "" {
			return errors.New("codex skill root must not be empty")
		}
		if !filepath.IsAbs(root) {
			return fmt.Errorf("codex skill root must be absolute: %s", root)
		}
		info, err := os.Stat(root)
		if err != nil {
			return fmt.Errorf("stat codex skill root %s: %w", root, err)
		}
		if !info.IsDir() {
			return fmt.Errorf("codex skill root is not a directory: %s", root)
		}
		exists, err := codexWorkflowBuilderSkillExists(root)
		if err != nil {
			return err
		}
		if exists {
			workflowBuilderFound = true
		}
	}
	if !workflowBuilderFound {
		return fmt.Errorf("codex skill roots do not contain %s/%s", codexWorkflowBuilderSkillName, codexSkillFileName)
	}
	return nil
}

func codexWorkflowBuilderSkillExists(root string) (bool, error) {
	path := filepath.Join(root, codexWorkflowBuilderSkillName, codexSkillFileName)
	info, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, fmt.Errorf("stat codex workflow-builder skill %s: %w", path, err)
	}
	if info.IsDir() {
		return false, fmt.Errorf("codex workflow-builder skill path is a directory: %s", path)
	}
	return true, nil
}

func (harness *CodexHarness) configureCodexSkillRoots(ctx context.Context, session *codexapp.Session) error {
	if harness.skillRootsErr != nil {
		return fmt.Errorf("configure codex skill roots: %w", harness.skillRootsErr)
	}
	params := codexapp.SkillsExtraRootsSetParams{
		ExtraRoots: codexAbsolutePathParams(harness.skillRoots),
	}
	raw, err := session.Call(ctx, codexapp.CodexMethodSkillsExtraRootsSet, params)
	if err != nil {
		return fmt.Errorf("configure codex skill roots: %w", err)
	}
	if _, err := codexapp.DecodeSkillsExtraRootsSetResponse(raw); err != nil {
		return fmt.Errorf("decode codex skill roots response: %w", err)
	}
	return nil
}

func codexAbsolutePathParams(paths []string) []codexapp.AbsolutePathBuf {
	result := make([]codexapp.AbsolutePathBuf, 0, len(paths))
	for _, path := range paths {
		result = append(result, codexapp.AbsolutePathBuf(path))
	}
	return result
}

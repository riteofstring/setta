package plugins

import (
	"fmt"
	"os"
	"path/filepath"
)

type MutationCheckpoint struct {
	root         string
	refreshState BackendRuntimeRefreshState
}

func (c *MutationCheckpoint) Close() error {
	if c == nil || c.root == "" {
		return nil
	}
	err := os.RemoveAll(c.root)
	c.root = ""
	return err
}

func (s *Service) CreateMutationCheckpoint() (*MutationCheckpoint, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	refreshState, err := s.BackendRuntimeRefreshState()
	if err != nil {
		return nil, err
	}

	root, err := os.MkdirTemp("", "setta-plugin-mutation-*")
	if err != nil {
		return nil, fmt.Errorf("create plugin mutation checkpoint root: %w", err)
	}
	checkpoint := &MutationCheckpoint{
		root:         root,
		refreshState: refreshState,
	}
	for _, entry := range s.store.mutationCheckpointEntries() {
		if err := checkpoint.capture(entry); err != nil {
			_ = checkpoint.Close()
			return nil, err
		}
	}
	return checkpoint, nil
}

func (s *Service) RestoreMutationCheckpoint(checkpoint *MutationCheckpoint) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}
	if checkpoint == nil {
		return nil
	}

	for _, entry := range s.store.mutationCheckpointEntries() {
		if err := checkpoint.restore(entry); err != nil {
			return err
		}
	}
	return s.RestoreBackendRuntimeRefreshState(checkpoint.refreshState)
}

type mutationCheckpointEntry struct {
	livePath string
	name     string
}

func (s *Store) mutationCheckpointEntries() []mutationCheckpointEntry {
	if s == nil {
		return nil
	}
	return []mutationCheckpointEntry{
		{livePath: s.workspacePluginsRoot, name: "workspace-plugins"},
		{livePath: s.settaFilesPluginsRoot, name: "setta-files-plugins"},
		{livePath: s.globalPluginsRoot, name: "global-plugins"},
		{livePath: s.pluginsStatePath, name: "plugins-state.json"},
		{livePath: s.pluginsGlobalStatePath, name: "plugins-global-state.json"},
		{livePath: s.installMetadataPath, name: "plugins-install-metadata.json"},
		{livePath: s.historyRoot, name: "plugins-history"},
	}
}

func (c *MutationCheckpoint) checkpointPath(entry mutationCheckpointEntry) string {
	if c == nil {
		return ""
	}
	return filepath.Join(c.root, entry.name)
}

func (c *MutationCheckpoint) capture(entry mutationCheckpointEntry) error {
	if c == nil {
		return nil
	}
	backupPath := c.checkpointPath(entry)
	return copyFilesystemPath(entry.livePath, backupPath)
}

func (c *MutationCheckpoint) restore(entry mutationCheckpointEntry) error {
	if c == nil {
		return nil
	}
	backupPath := c.checkpointPath(entry)
	if err := removePluginTarget(entry.livePath); err != nil {
		return err
	}
	return copyFilesystemPath(backupPath, entry.livePath)
}

func copyFilesystemPath(sourcePath string, targetPath string) error {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat plugin checkpoint source %s: %w", sourcePath, err)
	}
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		return copyDirectoryTreeSymlink(sourcePath, targetPath)
	case info.IsDir():
		return copyDirectoryTree(sourcePath, targetPath)
	case info.Mode().IsRegular():
		return copyDirectoryTreeFile(sourcePath, targetPath, info.Mode().Perm())
	default:
		return fmt.Errorf("copy plugin checkpoint: unsupported file mode at %s", sourcePath)
	}
}

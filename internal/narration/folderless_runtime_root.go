package narration

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

var folderlessRuntimeRootState struct {
	once sync.Once
	path string
	err  error
}

func folderlessRuntimeRoot() (string, error) {
	folderlessRuntimeRootState.once.Do(func() {
		root := filepath.Join(os.TempDir(), "setta-folderless-runtime")
		if err := os.MkdirAll(root, 0o700); err != nil {
			folderlessRuntimeRootState.err = fmt.Errorf("prepare folderless runtime root: %w", err)
			return
		}
		folderlessRuntimeRootState.path = root
	})
	return folderlessRuntimeRootState.path, folderlessRuntimeRootState.err
}

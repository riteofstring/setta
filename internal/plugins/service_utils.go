package plugins

import (
	"fmt"
	"os"
)

func manifestComponents(manifest PluginManifest) []string {
	components := []string{}
	if manifest.Backend != nil {
		components = append(components, "backend")
	}
	if manifest.Frontend != nil {
		components = append(components, "frontend")
	}
	if manifest.Content != nil {
		components = append(components, "content")
	}
	return components
}

func targetExists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

func removePluginTarget(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat plugin target %s: %w", path, err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return os.Remove(path)
	}
	if info.IsDir() {
		return os.RemoveAll(path)
	}
	return os.Remove(path)
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

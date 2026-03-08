package plugins

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"setta/internal/statefs"
)

var (
	ErrWorkerHostStaticDirRegistrarRequired = errors.New("plugins: static dir registrar is required")
	ErrWorkerHostStaticDirRequired          = errors.New("plugins: static dir registration is required")
	ErrWorkerHostStaticDirURLPrefixInvalid  = errors.New("plugins: static dir url prefix is invalid")
	ErrWorkerHostStaticDirPathRequired      = errors.New("plugins: static dir path is required")
	ErrWorkerHostStaticDirPathInvalid       = errors.New("plugins: static dir path is invalid")
	ErrBackendStaticDirRegistrationConflict = errors.New("plugins: duplicate backend static dir registration")
)

type BackendStaticDirRegistrar interface {
	RegisterStaticDir(context.Context, RegisteredBackendStaticDir) error
}

type RegisteredBackendStaticDir struct {
	PluginID  string
	URLPrefix string
	SourceDir string
}

type BackendStaticDirRegistry struct {
	mu         sync.Mutex
	byPluginID map[string]map[string]RegisteredBackendStaticDir
	staticDirs []RegisteredBackendStaticDir
}

func NewBackendStaticDirRegistry() *BackendStaticDirRegistry {
	return &BackendStaticDirRegistry{
		byPluginID: map[string]map[string]RegisteredBackendStaticDir{},
	}
}

func (r *BackendStaticDirRegistry) RegisterStaticDir(_ context.Context, registration RegisteredBackendStaticDir) error {
	if r == nil {
		return ErrWorkerHostStaticDirRegistrarRequired
	}

	pluginID := strings.TrimSpace(registration.PluginID)
	if pluginID == "" {
		return ErrWorkerHostPluginIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	knownPrefixes, ok := r.byPluginID[pluginID]
	if !ok {
		knownPrefixes = map[string]RegisteredBackendStaticDir{}
		r.byPluginID[pluginID] = knownPrefixes
	}

	if _, exists := knownPrefixes[registration.URLPrefix]; exists {
		return fmt.Errorf("%w: %s:%s", ErrBackendStaticDirRegistrationConflict, pluginID, registration.URLPrefix)
	}

	cloned := RegisteredBackendStaticDir{
		PluginID:  pluginID,
		URLPrefix: registration.URLPrefix,
		SourceDir: registration.SourceDir,
	}
	knownPrefixes[cloned.URLPrefix] = cloned
	r.staticDirs = append(r.staticDirs, cloned)
	return nil
}

func (r *BackendStaticDirRegistry) Registrations() []RegisteredBackendStaticDir {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredBackendStaticDir, len(r.staticDirs))
	copy(registrations, r.staticDirs)
	return registrations
}

func normalizeWorkerStaticDirPrefix(raw string) (string, error) {
	return normalizeWorkerMountSubpathWithError(raw, ErrWorkerHostStaticDirURLPrefixInvalid)
}

func normalizeWorkerStaticDirRegistration(
	worker WorkerContext,
	request RegisterStaticDirRequest,
) (RegisteredBackendStaticDir, error) {
	pluginID := strings.TrimSpace(worker.PluginID)
	if pluginID == "" {
		return RegisteredBackendStaticDir{}, ErrWorkerHostPluginIDRequired
	}

	pluginRoot := strings.TrimSpace(worker.PluginRoot)
	if pluginRoot == "" {
		return RegisteredBackendStaticDir{}, ErrWorkerHostPluginRootRequired
	}

	prefix, err := normalizeWorkerStaticDirPrefix(request.URLPrefix)
	if err != nil {
		return RegisteredBackendStaticDir{}, err
	}

	rawPath := strings.TrimSpace(request.Path)
	if rawPath == "" {
		return RegisteredBackendStaticDir{}, ErrWorkerHostStaticDirPathRequired
	}

	resolvedPath, err := statefs.ResolveWithinRoot(pluginRoot, rawPath, "plugin static dir path")
	if err != nil {
		return RegisteredBackendStaticDir{}, fmt.Errorf("%w: %v", ErrWorkerHostStaticDirPathInvalid, err)
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return RegisteredBackendStaticDir{}, fmt.Errorf("%w: %s", ErrWorkerHostStaticDirPathInvalid, resolvedPath)
		}
		return RegisteredBackendStaticDir{}, err
	}
	if !info.IsDir() {
		return RegisteredBackendStaticDir{}, fmt.Errorf("%w: %s", ErrWorkerHostStaticDirPathInvalid, resolvedPath)
	}

	return RegisteredBackendStaticDir{
		PluginID:  pluginID,
		URLPrefix: prefix,
		SourceDir: resolvedPath,
	}, nil
}

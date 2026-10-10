package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/setta/realtime/backend/internal/content"
	"github.com/setta/realtime/backend/internal/project"
	runtimectrl "github.com/setta/realtime/backend/internal/runtime"
	"github.com/setta/realtime/backend/internal/server"
	"github.com/setta/realtime/backend/internal/worker"
)

type serverCoordinator interface {
	server.Coordinator
}

type projectEvents interface {
	server.ProjectStore
}

type contentStore interface {
	server.ContentStore
}

type localApplication struct {
	coordinator *runtimectrl.Coordinator
	projects    *project.Store
	content     *content.Store
}

func openLocalApplication(projectRoot string, create bool, launcherPython string) (openedApplication, error) {
	canonicalRoot, err := canonicalProjectRoot(projectRoot)
	if err != nil {
		return nil, err
	}
	stateRoot := filepath.Join(canonicalRoot, ".local", "realtime")
	projects, err := project.Open(filepath.Join(stateRoot, "project.json"), create)
	if err != nil {
		return nil, err
	}
	if create {
		if err := initializeEntrypoint(canonicalRoot, projects); err != nil {
			_ = projects.Close()
			return nil, err
		}
	}
	contentStore, err := content.Open(stateRoot)
	if err != nil {
		_ = projects.Close()
		return nil, err
	}
	manager, err := worker.NewManager(worker.Options{
		LauncherPython: launcherPython,
		Environment:    workerEnvironment(),
		StagingRoot:    stateRoot,
		ContentOpener:  contentStore,
	})
	if err != nil {
		_ = contentStore.Close()
		_ = projects.Close()
		return nil, err
	}
	coordinator, err := runtimectrl.New(canonicalRoot, projects, contentStore, manager)
	if err != nil {
		_ = manager.Close()
		_ = contentStore.Close()
		_ = projects.Close()
		return nil, err
	}
	return &localApplication{coordinator: coordinator, projects: projects, content: contentStore}, nil
}

func workerEnvironment() []string {
	inherited := os.Environ()
	prepared := make([]string, 0, len(inherited))
	for _, value := range inherited {
		key, _, found := strings.Cut(value, "=")
		if found && strings.EqualFold(key, launcherPythonEnvironment) {
			continue
		}
		prepared = append(prepared, value)
	}
	return prepared
}

func (application *localApplication) Coordinator() commandCoordinator {
	return application.coordinator
}

func (application *localApplication) ServerCoordinator() serverCoordinator {
	return application.coordinator
}

func (application *localApplication) ProjectEvents() projectEvents {
	return application.projects
}

func (application *localApplication) ContentStore() contentStore {
	return application.content
}

func (application *localApplication) Close() error {
	if application == nil {
		return nil
	}
	return errors.Join(application.coordinator.Close(), application.content.Close(), application.projects.Close())
}

var (
	_ openedApplication  = (*localApplication)(nil)
	_ commandCoordinator = (*runtimectrl.Coordinator)(nil)
	_ serverCoordinator  = (*runtimectrl.Coordinator)(nil)
	_ projectEvents      = (*project.Store)(nil)
	_ contentStore       = (*content.Store)(nil)
)

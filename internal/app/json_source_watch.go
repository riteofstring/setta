package app

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"setta/internal/jsonsourcewatch"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
)

type jsonSourceWatchServiceOptions struct {
	ProjectState  *projectstate.Runtime
	WebsocketHub  *realtime.WebsocketHub
	WorkspaceRoot string
	Logger        *slog.Logger
}

func newJSONSourceWatchService(options jsonSourceWatchServiceOptions) (*jsonsourcewatch.Service, error) {
	if options.ProjectState == nil {
		return nil, fmt.Errorf("project state runtime is required")
	}

	return jsonsourcewatch.NewService(jsonsourcewatch.ServiceOptions{
		OnFileUpdate: func(ctx context.Context, update jsonsourcewatch.FileUpdate) error {
			bindings := make([]projectstate.JSONSourceFileBinding, 0, len(update.Bindings))
			for _, binding := range update.Bindings {
				bindings = append(bindings, projectstate.JSONSourceFileBinding{
					ProjectID: binding.ProjectID,
					SectionID: binding.SectionID,
					VariantID: binding.VariantID,
				})
			}

			snapshot, err := options.ProjectState.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
				if err := document.ReloadJSONSourceBindingsFromDisk(options.WorkspaceRoot, bindings); err != nil {
					return document, err
				}
				return document, nil
			})
			if err != nil {
				return err
			}
			return broadcastJSONSourceWatchProjects(
				ctx,
				options.WebsocketHub,
				options.ProjectState,
				snapshot,
				update.Bindings,
			)
		},
		OnError: func(err error) {
			if options.Logger != nil {
				options.Logger.Error("json source watch runtime failed", "error", err)
			}
		},
	})
}

func syncJSONSourceWatchInputs(service *jsonsourcewatch.Service, document projectstate.Document, workspaceRoot string) error {
	if service == nil {
		return nil
	}

	inputs, err := projectstate.JSONSourceFileInputs(document, workspaceRoot)
	if err != nil {
		return err
	}
	serviceInputs := make([]jsonsourcewatch.FileInput, 0, len(inputs))
	for _, input := range inputs {
		bindings := make([]jsonsourcewatch.Binding, 0, len(input.Bindings))
		for _, binding := range input.Bindings {
			bindings = append(bindings, jsonsourcewatch.Binding{
				ProjectID: binding.ProjectID,
				SectionID: binding.SectionID,
				VariantID: binding.VariantID,
			})
		}
		serviceInputs = append(serviceInputs, jsonsourcewatch.FileInput{
			Path:     input.Path,
			Bindings: bindings,
		})
	}
	return service.SyncInputs(serviceInputs)
}

func broadcastJSONSourceWatchProjects(
	ctx context.Context,
	websocketHub *realtime.WebsocketHub,
	runtime *projectstate.Runtime,
	snapshot projectstate.Snapshot,
	bindings []jsonsourcewatch.Binding,
) error {
	if websocketHub == nil || runtime == nil {
		return nil
	}

	projectIDs := make([]string, 0, len(bindings))
	seen := map[string]struct{}{}
	for _, binding := range bindings {
		projectID := strings.TrimSpace(binding.ProjectID)
		if projectID == "" {
			continue
		}
		if _, exists := seen[projectID]; exists {
			continue
		}
		seen[projectID] = struct{}{}
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)

	status := runtime.FrontendOpStatus()
	for _, projectID := range projectIDs {
		projectStateView, err := projectview.SingleConfigByProjectID(snapshot.Document, projectID)
		if err != nil {
			return err
		}
		if _, err := websocketHub.BroadcastJSON(
			ctx,
			realtime.NewProjectStateUpdateMessage(realtime.ProjectStateUpdateContent{
				ProjectState:   projectStateView,
				CompletedOpIDs: status.Completed,
				PendingOpIDs:   status.Pending,
			}),
			realtime.Selection{Type: realtime.ConnectionTypeFrontend},
		); err != nil {
			return err
		}
	}

	return nil
}

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/artifacts"
	"setta/internal/artifactwatch"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/statefs"
)

type artifactWatchServiceOptions struct {
	Artifacts      *artifacts.Service
	WebsocketHub   *realtime.WebsocketHub
	ListenerEvents *realtime.ListenerProducer
	Logger         *slog.Logger
}

type artifactWatchUpdateOutputs struct {
	frontendArtifacts    []any
	imageDeltasByProject map[string][]realtime.BinarySectionDelta
}

type artifactWatchCachedLoader[T any] func(context.Context, artifacts.LoadCachedPathsRequest) ([]*T, error)

func newArtifactWatchService(options artifactWatchServiceOptions) (*artifactwatch.Service, error) {
	if options.Artifacts == nil {
		return nil, fmt.Errorf("artifact service is required")
	}

	return artifactwatch.NewService(artifactwatch.ServiceOptions{
		OnFileUpdate: func(ctx context.Context, update artifactwatch.FileUpdate) error {
			outputs, err := collectArtifactWatchUpdateOutputs(ctx, options.Artifacts, update, options.ListenerEvents != nil)
			if err != nil {
				return err
			}
			if err := broadcastArtifactWatchFrontendArtifacts(ctx, options.WebsocketHub, outputs.frontendArtifacts); err != nil {
				return err
			}
			return emitArtifactWatchImageDeltas(ctx, options.ListenerEvents, outputs.imageDeltasByProject)
		},
		OnError: func(err error) {
			if options.Logger != nil {
				options.Logger.Error("artifact watch runtime failed", "error", err)
			}
		},
	})
}

func collectArtifactWatchUpdateOutputs(
	ctx context.Context,
	artifactService *artifacts.Service,
	update artifactwatch.FileUpdate,
	includeImageDeltas bool,
) (artifactWatchUpdateOutputs, error) {
	outputs := artifactWatchUpdateOutputs{
		frontendArtifacts:    make([]any, 0, len(update.Types)),
		imageDeltasByProject: map[string][]realtime.BinarySectionDelta{},
	}
	for _, artifactType := range update.Types {
		frontendArtifact, imageDeltasByProject, err := loadArtifactWatchUpdate(
			ctx,
			artifactService,
			update.Path,
			artifactType,
			update.ImageRefs,
			includeImageDeltas,
		)
		if err != nil {
			return artifactWatchUpdateOutputs{}, err
		}
		if frontendArtifact != nil {
			outputs.frontendArtifacts = append(outputs.frontendArtifacts, frontendArtifact)
		}
		mergeArtifactWatchImageDeltas(outputs.imageDeltasByProject, imageDeltasByProject)
	}
	return outputs, nil
}

func loadArtifactWatchUpdate(
	ctx context.Context,
	artifactService *artifacts.Service,
	path string,
	artifactType artifacts.ArtifactType,
	imageRefs []artifactwatch.ImageRef,
	includeImageDeltas bool,
) (any, map[string][]realtime.BinarySectionDelta, error) {
	switch artifactType {
	case artifacts.ArtifactTypeImage:
		return loadArtifactWatchImageUpdate(ctx, artifactService, path, imageRefs, includeImageDeltas)
	case artifacts.ArtifactTypeChartData:
		return loadArtifactWatchSimpleUpdate(ctx, path, artifactService.LoadCachedChartData)
	case artifacts.ArtifactTypeBrushStroke:
		return loadArtifactWatchSimpleUpdate(ctx, path, artifactService.LoadCachedBrushStrokes)
	case artifacts.ArtifactTypeDrawAreaLayerItemTransform:
		return loadArtifactWatchSimpleUpdate(ctx, path, artifactService.LoadCachedDrawAreaLayerItemTransforms)
	default:
		return nil, nil, nil
	}
}

func loadArtifactWatchImageUpdate(
	ctx context.Context,
	artifactService *artifacts.Service,
	path string,
	imageRefs []artifactwatch.ImageRef,
	includeImageDeltas bool,
) (any, map[string][]realtime.BinarySectionDelta, error) {
	imageArtifact, err := loadArtifactWatchCachedValue(ctx, path, artifactService.LoadCachedImages)
	if err != nil || imageArtifact == nil {
		return nil, nil, err
	}
	imageDeltasByProject, err := buildArtifactWatchImageDeltas(artifactService, *imageArtifact, imageRefs, includeImageDeltas)
	if err != nil {
		return nil, nil, err
	}
	return *imageArtifact, imageDeltasByProject, nil
}

func loadArtifactWatchSimpleUpdate[T any](
	ctx context.Context,
	path string,
	load artifactWatchCachedLoader[T],
) (any, map[string][]realtime.BinarySectionDelta, error) {
	artifact, err := loadArtifactWatchCachedValue(ctx, path, load)
	if err != nil || artifact == nil {
		return nil, nil, err
	}
	return *artifact, nil, nil
}

func loadArtifactWatchCachedValue[T any](
	ctx context.Context,
	path string,
	load artifactWatchCachedLoader[T],
) (*T, error) {
	loaded, err := load(ctx, artifacts.LoadCachedPathsRequest{
		Paths: []string{path},
	})
	if err != nil {
		return nil, err
	}
	if len(loaded) == 0 || loaded[0] == nil {
		return nil, nil
	}
	return loaded[0], nil
}

func buildArtifactWatchImageDeltas(
	artifactService *artifacts.Service,
	imageArtifact artifacts.ImageArtifact,
	imageRefs []artifactwatch.ImageRef,
	includeImageDeltas bool,
) (map[string][]realtime.BinarySectionDelta, error) {
	if !includeImageDeltas || len(imageRefs) == 0 {
		return nil, nil
	}

	binaryPayload, err := artifactService.ReadBinaryContent(imageArtifact.Value.ContentID)
	if err != nil {
		return nil, err
	}

	imageDeltasByProject := make(map[string][]realtime.BinarySectionDelta, len(imageRefs))
	for _, ref := range imageRefs {
		imageDeltasByProject[ref.ProjectID] = append(imageDeltasByProject[ref.ProjectID], realtime.BinarySectionDelta{
			SectionID:     ref.SectionID,
			Value:         imageArtifact.Value,
			BinaryPayload: binaryPayload,
		})
	}
	return imageDeltasByProject, nil
}

func mergeArtifactWatchImageDeltas(
	destination map[string][]realtime.BinarySectionDelta,
	source map[string][]realtime.BinarySectionDelta,
) {
	for projectID, deltas := range source {
		destination[projectID] = append(destination[projectID], deltas...)
	}
}

func broadcastArtifactWatchFrontendArtifacts(
	ctx context.Context,
	websocketHub *realtime.WebsocketHub,
	frontendArtifacts []any,
) error {
	if websocketHub == nil || len(frontendArtifacts) == 0 {
		return nil
	}

	_, err := websocketHub.BroadcastJSON(
		ctx,
		realtime.NewUpdateArtifactsMessage(realtime.UpdateArtifactsContent{
			Artifacts:  frontendArtifacts,
			UpdateType: "update",
		}),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}

func emitArtifactWatchImageDeltas(
	ctx context.Context,
	listenerEvents *realtime.ListenerProducer,
	imageDeltasByProject map[string][]realtime.BinarySectionDelta,
) error {
	if listenerEvents == nil || len(imageDeltasByProject) == 0 {
		return nil
	}

	projectIDs := make([]string, 0, len(imageDeltasByProject))
	for projectID := range imageDeltasByProject {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Strings(projectIDs)
	for _, projectID := range projectIDs {
		if err := listenerEvents.EmitSectionBinaryDeltas(ctx, realtime.EmitSectionBinaryDeltasParams{
			ProjectID: projectID,
			Deltas:    imageDeltasByProject[projectID],
		}); err != nil {
			return err
		}
	}
	return nil
}

func syncArtifactWatchInputs(service *artifactwatch.Service, document projectstate.Document, settaFilesRoot string) error {
	if service == nil {
		return nil
	}

	inputs, err := artifactWatchInputs(document, settaFilesRoot)
	if err != nil {
		return err
	}
	return service.SyncInputs(inputs)
}

func artifactWatchInputs(document projectstate.Document, settaFilesRoot string) ([]artifactwatch.FileInput, error) {
	artifactsRoot := filepath.Join(settaFilesRoot, "artifacts")
	inputsByPath := map[string]*artifactwatch.FileInput{}

	for projectID, project := range document.Projects {
		for sectionID, variantID := range project.SectionVariantMap {
			variant, ok := project.SectionVariants[variantID]
			if !ok {
				return nil, fmt.Errorf("%w: section=%q variant=%q", projectstate.ErrSectionVariantNotFound, sectionID, variantID)
			}
			impl, ok := project.SectionImpls[variant.ImplID]
			if !ok {
				return nil, fmt.Errorf("%w: variant=%q impl=%q", projectstate.ErrSectionImplNotFound, variantID, variant.ImplID)
			}

			payload, err := rawArtifactWatchPayload(impl.Payload)
			if err != nil {
				return nil, err
			}
			switch payloadType(payload) {
			case "Image":
				addArtifactWatchPath(inputsByPath, artifactsRoot, settaFilesRoot, payloadString(payload, "imagePath"), artifacts.ArtifactTypeImage, &artifactwatch.ImageRef{
					ProjectID: projectID,
					SectionID: sectionID,
				})
			case "Chart":
				addArtifactWatchPath(inputsByPath, artifactsRoot, settaFilesRoot, payloadString(payload, "dataPath"), artifacts.ArtifactTypeChartData, nil)
			case "Draw":
				for _, layer := range payloadObjectSlice(payload, "layers") {
					for _, element := range payloadObjectSlice(layer, "elements") {
						switch strings.TrimSpace(payloadString(element, "type")) {
						case string(artifacts.ArtifactTypeImage):
							addArtifactWatchPath(inputsByPath, artifactsRoot, settaFilesRoot, payloadString(element, "dataPath"), artifacts.ArtifactTypeImage, nil)
						case string(artifacts.ArtifactTypeBrushStroke):
							addArtifactWatchPath(inputsByPath, artifactsRoot, settaFilesRoot, payloadString(element, "dataPath"), artifacts.ArtifactTypeBrushStroke, nil)
						}
						addArtifactWatchPath(inputsByPath, artifactsRoot, settaFilesRoot, payloadString(element, "transformId"), artifacts.ArtifactTypeDrawAreaLayerItemTransform, nil)
					}
				}
			}
		}
	}

	paths := make([]string, 0, len(inputsByPath))
	for path := range inputsByPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	inputs := make([]artifactwatch.FileInput, 0, len(paths))
	for _, path := range paths {
		inputs = append(inputs, *inputsByPath[path])
	}
	return inputs, nil
}

func addArtifactWatchPath(
	inputsByPath map[string]*artifactwatch.FileInput,
	artifactsRoot string,
	settaFilesRoot string,
	rawPath string,
	artifactType artifacts.ArtifactType,
	imageRef *artifactwatch.ImageRef,
) {
	normalizedPath, ok := normalizeArtifactWatchPath(artifactsRoot, settaFilesRoot, rawPath)
	if !ok {
		return
	}

	input, exists := inputsByPath[normalizedPath]
	if !exists {
		input = &artifactwatch.FileInput{Path: normalizedPath}
		inputsByPath[normalizedPath] = input
	}
	input.Types = append(input.Types, artifactType)
	if imageRef != nil {
		input.ImageRefs = append(input.ImageRefs, *imageRef)
	}
}

func normalizeArtifactWatchPath(artifactsRoot string, settaFilesRoot string, rawPath string) (string, bool) {
	trimmed := strings.TrimSpace(rawPath)
	if trimmed == "" {
		return "", false
	}

	var (
		resolved string
		err      error
	)
	if filepath.IsAbs(trimmed) {
		resolved, err = statefs.NormalizePath(trimmed, "")
	} else {
		resolved, err = statefs.ResolveWithinRoot(settaFilesRoot, trimmed, "artifact path")
	}
	if err != nil {
		return "", false
	}
	if _, err := statefs.EnsureWithinRoot(artifactsRoot, resolved, "artifact path"); err != nil {
		return "", false
	}
	return resolved, true
}

func rawArtifactWatchPayload(raw projectstate.RawJSON) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode artifact watch payload: %w", err)
	}
	return payload, nil
}

func payloadType(payload map[string]any) string {
	return strings.TrimSpace(payloadString(payload, "type"))
}

func payloadString(payload map[string]any, key string) string {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return value
}

func payloadObjectSlice(payload map[string]any, key string) []map[string]any {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	objects := make([]map[string]any, 0, len(items))
	for _, item := range items {
		object, ok := item.(map[string]any)
		if !ok {
			continue
		}
		objects = append(objects, object)
	}
	return objects
}

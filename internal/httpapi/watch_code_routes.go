package httpapi

import (
	"github.com/go-chi/chi/v5"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/watchcodehttp"
)

const (
	RouteSetWatchCodeEnabled = "/setWatchCodeEnabled"
	RouteSetWatchCodeInputs  = "/setWatchCodeInputs"
)

type SetWatchCodeEnabledRequest = watchcodehttp.SetWatchCodeEnabledRequest
type SetWatchCodeInputsRequest = watchcodehttp.SetWatchCodeInputsRequest

type WatchCodeRouteDependencies struct {
	ModePolicy            modes.Policy
	WorkspaceRoot         string
	ProjectState          *projectstate.Runtime
	SettingsProjectState  *projectstate.Runtime
	WebsocketHub          *realtime.WebsocketHub
	WatchCodeCapabilities func() plugins.PluginWatchCodeCapabilities
}

func BuildWatchCodeFrontendAPIRouteRegistrations(
	deps WatchCodeRouteDependencies,
) FrontendAPIRouteRegistrations {
	if !deps.ModePolicy.IsIDE() {
		return FrontendAPIRouteRegistrations{}
	}
	return FrontendAPIRouteRegistrations{
		Project: []FrontendAPIRouteContribution{
			{
				Family: "watch code",
				Register: func(router chi.Router) error {
					return RegisterWatchCodeRoutes(router, deps)
				},
			},
		},
	}
}

func RegisterWatchCodeRoutes(router chi.Router, deps WatchCodeRouteDependencies) error {
	documentOnly := openAPIDocumentOnlyFromRouter(router)
	handlerDeps := watchCodeHandlerDependencies(deps)
	if err := watchcodehttp.ValidateRouteDependencies(
		handlerDeps,
		documentOnly || !deps.ModePolicy.IsIDE(),
	); err != nil {
		return err
	}

	ideRouter := router.With(RequireIDEMode(deps.ModePolicy))
	if deps.ModePolicy.IsDeployment() {
		ideRouter = routerWithoutOpenAPI(ideRouter)
	}
	registerProjectNullPost[SetWatchCodeEnabledRequest](
		ideRouter,
		RouteSetWatchCodeEnabled,
		watchcodehttp.SetWatchCodeEnabledHandler(handlerDeps),
	)
	registerProjectNullPost[SetWatchCodeInputsRequest](
		ideRouter,
		RouteSetWatchCodeInputs,
		watchcodehttp.SetWatchCodeInputsHandler(handlerDeps),
	)
	return nil
}

func watchCodeHandlerDependencies(deps WatchCodeRouteDependencies) watchcodehttp.RouteDependencies {
	return watchcodehttp.RouteDependencies{
		WorkspaceRoot:         deps.WorkspaceRoot,
		ProjectState:          deps.ProjectState,
		SettingsProjectState:  deps.SettingsProjectState,
		WebsocketHub:          deps.WebsocketHub,
		WatchCodeCapabilities: deps.WatchCodeCapabilities,
		WriteJSON:             WriteJSON,
		WriteError:            WriteError,
	}
}

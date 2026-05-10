package httpapi

import (
	"fmt"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/plugins"
)

var openAPIRouteDependencyModePolicyType = reflect.TypeFor[modes.Policy]()

var frontendOpenAPIDocumentModeOverrides = map[string]config.Mode{
	"ShareDeployment": config.ModeShare,
	"LauncherHome":    config.ModeLauncher,
	"AI":              config.ModeShare,
}

func registerFrontendHTTPOpenAPIDocumentRoutesWithRegistrations(
	router chi.Router,
	registrationBuilder FrontendAPIRouteRegistrationBuilder,
) error {
	rootDeps, err := newOpenAPIDocumentRouteDependencies[FrontendRootRouteDependencies](nil)
	if err != nil {
		return err
	}
	apiDeps, err := newOpenAPIDocumentRouteDependencies[FrontendAPIRouteDependencies](frontendOpenAPIDocumentModeOverrides)
	if err != nil {
		return err
	}
	apiDeps.Plugin.Service = (*plugins.Service)(nil)

	registerCoreRuntimeOpenAPIRoutes(router, NewConfigInfoService(config.Config{
		Server: config.Server{Mode: config.ModeIDE},
	}, ""))
	if err := RegisterFrontendRootRoutes(router, rootDeps); err != nil {
		return err
	}
	registrations := FrontendAPIRouteRegistrations{}
	if registrationBuilder != nil {
		registrations = registrationBuilder(apiDeps)
	}
	return RegisterFrontendAPIRoutes(
		router,
		apiDeps,
		registrations,
	)
}

func newOpenAPIDocumentRouteDependencies[T any](modeOverrides map[string]config.Mode) (T, error) {
	var deps T
	container := reflect.ValueOf(&deps).Elem()
	if container.Kind() != reflect.Struct {
		return deps, fmt.Errorf("document route dependency container must be a struct")
	}
	for index := 0; index < container.NumField(); index++ {
		field := container.Field(index)
		fieldName := container.Type().Field(index).Name
		mode := config.ModeIDE
		if override, ok := modeOverrides[fieldName]; ok {
			mode = override
		}
		if err := setOpenAPIDocumentRouteDependencyModePolicy(field, modes.NewPolicy(mode)); err != nil {
			return deps, fmt.Errorf("%s: %w", fieldName, err)
		}
	}
	return deps, nil
}

func setOpenAPIDocumentRouteDependencyModePolicy(field reflect.Value, policy modes.Policy) error {
	if field.Kind() == reflect.Pointer {
		if field.IsNil() {
			field.Set(reflect.New(field.Type().Elem()))
		}
		field = field.Elem()
	}
	if field.Kind() != reflect.Struct {
		return fmt.Errorf("route dependency must be a struct or pointer to struct")
	}
	modeField := field.FieldByName("ModePolicy")
	if !modeField.IsValid() || !modeField.CanSet() || modeField.Type() != openAPIRouteDependencyModePolicyType {
		return fmt.Errorf("route dependency must expose a settable ModePolicy")
	}
	modeField.Set(reflect.ValueOf(policy))
	return nil
}

func BuildFrontendHTTPOpenAPIDocumentWithRegistrationBuilder(
	registrationBuilder FrontendAPIRouteRegistrationBuilder,
) (*huma.OpenAPI, error) {
	document := newOpenAPIDocument()
	router := wrapRouterWithOpenAPIDocumentOnly(chi.NewRouter(), document)
	if err := registerFrontendHTTPOpenAPIDocumentRoutesWithRegistrations(router, registrationBuilder); err != nil {
		return nil, err
	}
	return document, nil
}

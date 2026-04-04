package projectview

import (
	"reflect"

	"setta/internal/projectstate"
)

func FrontendDefaultProjectConfig() ProjectConfig {
	defaults := ProjectConfig{
		RunCapabilities: ProjectRunCapabilities{},
	}
	initializeNilCollections(&defaults)
	return defaults
}

func FrontendDefaultSingleConfig() SingleConfig {
	defaults := SingleConfig{
		ProjectConfig:        FrontendDefaultProjectConfig(),
		ProjectChatWindowing: projectstate.DefaultProjectChatWindowingState(),
	}
	initializeNilCollections(&defaults)
	return defaults
}

func initializeNilCollections(target any) {
	value := reflect.ValueOf(target)
	if !value.IsValid() || value.Kind() != reflect.Pointer || value.IsNil() {
		panic("initializeNilCollections requires a non-nil pointer")
	}
	initializeNilCollectionsValue(value.Elem())
}

func initializeNilCollectionsValue(value reflect.Value) {
	switch value.Kind() {
	case reflect.Interface, reflect.Pointer:
		if value.IsNil() {
			return
		}
		initializeNilCollectionsValue(value.Elem())
	case reflect.Struct:
		for fieldIndex := 0; fieldIndex < value.NumField(); fieldIndex++ {
			field := value.Field(fieldIndex)
			if !field.CanSet() {
				continue
			}
			initializeNilCollectionsValue(field)
		}
	case reflect.Map:
		if value.IsNil() {
			value.Set(reflect.MakeMap(value.Type()))
		}
	case reflect.Slice:
		if value.IsNil() {
			value.Set(reflect.MakeSlice(value.Type(), 0, 0))
		}
	}
}

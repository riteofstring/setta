package sharedtypes

import (
	"reflect"
	"testing"
	"time"
)

type RegistryTestMapKey string

type RegistryTestMapValue struct{}

type RegistryTestSliceValue struct{}

type RegistryTestRepeatedLeaf struct{}

type RegistryTestFuncArg struct{}

type RegistryTestMethodArg struct{}

type RegistryTestMethodResult struct{}

type RegistryTestInterface interface {
	Handle(RegistryTestMethodArg) RegistryTestMethodResult
}

type RegistryTestRoot struct {
	Mapping   map[RegistryTestMapKey]RegistryTestMapValue
	Values    []RegistryTestSliceValue
	Repeated  RegistryTestRepeatedLeaf
	Callback  func(RegistryTestFuncArg) RegistryTestRepeatedLeaf
	Interface RegistryTestInterface
	CreatedAt time.Time
}

func TestSharedTypeDiscoveryVisitTraversesSupportedKinds(t *testing.T) {
	t.Parallel()

	discovery := newSharedTypeDiscovery()
	discovery.visit(reflect.TypeOf(RegistryTestRoot{}))

	wantTypes := []reflect.Type{
		reflect.TypeOf(RegistryTestRoot{}),
		reflect.TypeOf(RegistryTestMapKey("")),
		reflect.TypeOf(RegistryTestMapValue{}),
		reflect.TypeOf(RegistryTestSliceValue{}),
		reflect.TypeOf(RegistryTestRepeatedLeaf{}),
		reflect.TypeOf(RegistryTestFuncArg{}),
		reflect.TypeOf((*RegistryTestInterface)(nil)).Elem(),
		reflect.TypeOf(RegistryTestMethodArg{}),
		reflect.TypeOf(RegistryTestMethodResult{}),
	}

	discoveredCounts := map[reflect.Type]int{}
	for _, t := range discovery.types {
		discoveredCounts[t]++
	}

	for _, want := range wantTypes {
		if discoveredCounts[want] != 1 {
			t.Fatalf("discovered count for %v = %d, want 1", want, discoveredCounts[want])
		}
	}

	if got := discoveredCounts[reflect.TypeOf(time.Time{})]; got != 0 {
		t.Fatalf("time.Time discovered count = %d, want 0", got)
	}
}

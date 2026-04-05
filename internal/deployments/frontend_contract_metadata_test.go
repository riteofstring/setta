package deployments

import (
	"reflect"
	"testing"
)

func TestFrontendDefaultPolicyUsesCanonicalDefault(t *testing.T) {
	if got := FrontendDefaultPolicy(); !reflect.DeepEqual(got, DefaultPolicy()) {
		t.Fatalf("expected frontend default policy to match canonical defaults, got %#v", got)
	}
}

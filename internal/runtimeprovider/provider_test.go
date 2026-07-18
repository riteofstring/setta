package runtimeprovider

import (
	"errors"
	"slices"
	"strings"
	"testing"
)

func TestNewManagedIdentityIsDeterministicAndOpaque(t *testing.T) {
	first, err := NewManagedIdentity("user@example.com")
	if err != nil {
		t.Fatalf("NewManagedIdentity first: %v", err)
	}
	second, err := NewManagedIdentity("user@example.com")
	if err != nil {
		t.Fatalf("NewManagedIdentity second: %v", err)
	}
	other, err := NewManagedIdentity("other@example.com")
	if err != nil {
		t.Fatalf("NewManagedIdentity other: %v", err)
	}

	if first.Name != second.Name {
		t.Fatalf("identity names differ: %q != %q", first.Name, second.Name)
	}
	if first.Name == other.Name {
		t.Fatalf("different owner keys produced %q", first.Name)
	}
	if strings.Contains(first.Name, "user") || strings.Contains(strings.Join(first.Labels, " "), "user@example.com") {
		t.Fatalf("identity exposes owner key: %#v", first)
	}
	if err := first.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
}

func TestManagedIdentityFromNameOwnsLabelDerivation(t *testing.T) {
	derived, err := NewManagedIdentity("owner-for-reconstruction")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	reconstructed, err := ManagedIdentityFromName(derived.Name)
	if err != nil {
		t.Fatalf("ManagedIdentityFromName: %v", err)
	}
	if reconstructed.Name != derived.Name || !slices.Equal(reconstructed.Labels, derived.Labels) {
		t.Fatalf("reconstructed = %#v, want %#v", reconstructed, derived)
	}
	if _, err := ManagedIdentityFromName("foreign-runtime"); !errors.Is(err, ErrInvalidContract) {
		t.Fatalf("invalid name error = %v, want ErrInvalidContract", err)
	}
}

func TestManagedIdentityRejectsNonSettaValues(t *testing.T) {
	valid, err := NewManagedIdentity("owner")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}

	tests := map[string]ManagedIdentity{
		"empty":          {},
		"foreign name":   {Name: "customer-runtime", Labels: valid.Labels},
		"uppercase hash": {Name: strings.ToUpper(valid.Name), Labels: valid.Labels},
		"missing label":  {Name: valid.Name, Labels: valid.Labels[:1]},
		"foreign label":  {Name: valid.Name, Labels: []string{"setta-managed", "customer-owned"}},
	}

	for name, identity := range tests {
		t.Run(name, func(t *testing.T) {
			err := identity.Validate()
			if !errors.Is(err, ErrInvalidContract) {
				t.Fatalf("Validate error = %v, want ErrInvalidContract", err)
			}
		})
	}
}

func TestNewManagedIdentityRejectsEmptyOwnerKey(t *testing.T) {
	_, err := NewManagedIdentity("")
	if !errors.Is(err, ErrInvalidContract) {
		t.Fatalf("NewManagedIdentity error = %v, want ErrInvalidContract", err)
	}
}

func TestValidateManagedName(t *testing.T) {
	identity, err := NewManagedIdentity("owner")
	if err != nil {
		t.Fatalf("NewManagedIdentity: %v", err)
	}
	if err := ValidateManagedName(identity.Name); err != nil {
		t.Fatalf("ValidateManagedName: %v", err)
	}

	for _, name := range []string{"setta-u-short", strings.ToUpper(identity.Name), "foreign-" + identity.Name} {
		if err := ValidateManagedName(name); !errors.Is(err, ErrInvalidContract) {
			t.Fatalf("name %q error = %v, want ErrInvalidContract", name, err)
		}
	}
}

func TestServiceSpecValidateAcceptsProviderDefaultAndExplicitIdentity(t *testing.T) {
	spec := ServiceSpec{
		Name: "setta-runtime",
		Path: "/opt/setta/bin/setta",
	}
	if err := spec.Validate(); err != nil {
		t.Fatalf("Validate provider default identity: %v", err)
	}

	spec.RunAs = ServiceIdentity{User: "setta-runtime", Group: "setta-runtime"}
	if err := spec.Validate(); err != nil {
		t.Fatalf("Validate explicit identity: %v", err)
	}

	spec.RunAs = ServiceIdentity{User: "65534", Group: "65534"}
	if err := spec.Validate(); err != nil {
		t.Fatalf("Validate numeric identity: %v", err)
	}
}

func TestServiceSpecValidateRejectsMalformedIdentity(t *testing.T) {
	base := ServiceSpec{
		Name: "setta-runtime",
		Path: "/opt/setta/bin/setta",
	}
	tests := map[string]ServiceIdentity{
		"missing group": {User: "setta-runtime"},
		"missing user":  {Group: "setta-runtime"},
		"space":         {User: "setta runtime", Group: "setta-runtime"},
		"path":          {User: "../root", Group: "root"},
		"option":        {User: "-root", Group: "root"},
		"mixed numeric": {User: "1000root", Group: "root"},
	}
	for name, identity := range tests {
		t.Run(name, func(t *testing.T) {
			spec := base
			spec.RunAs = identity
			if err := spec.Validate(); !errors.Is(err, ErrInvalidContract) {
				t.Fatalf("Validate error = %v, want ErrInvalidContract", err)
			}
		})
	}
}

func TestServiceSpecValidateRejectsMalformedServiceContract(t *testing.T) {
	tests := []ServiceSpec{
		{Name: "Setta", Path: "/opt/setta/bin/setta"},
		{Name: "setta_runtime", Path: "/opt/setta/bin/setta"},
		{Name: "setta-runtime", Path: "setta"},
		{Name: "setta-runtime", Path: "/opt/setta/bin/setta", HTTPPort: intPtr(0)},
		{Name: "setta-runtime", Path: "/opt/setta/bin/setta", HTTPPort: intPtr(65536)},
	}
	for _, spec := range tests {
		if err := spec.Validate(); !errors.Is(err, ErrInvalidContract) {
			t.Fatalf("spec %#v error = %v, want ErrInvalidContract", spec, err)
		}
	}
}

func intPtr(value int) *int {
	return &value
}

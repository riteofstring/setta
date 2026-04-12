package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type strictJSONHelperPayload struct {
	Name     string  `json:"name"`
	Optional *string `json:"optional"`
}

func TestDecodeStrictJSONBodyWithRequiredFieldsRejectsNilBodyWhenFieldRequired(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.Body = nil

	_, err := decodeStrictJSONBodyWithRequiredFields[strictJSONHelperPayload](
		request,
		strictJSONFieldRequirement{Field: "name"},
	)
	var missingFieldErr *strictJSONMissingFieldError
	if !errors.As(err, &missingFieldErr) {
		t.Fatalf("expected missing field error, got %v", err)
	}
	if missingFieldErr.Field != "name" {
		t.Fatalf("expected missing name field, got %q", missingFieldErr.Field)
	}
}

func TestDecodeStrictJSONBodyWithRequiredFieldsRejectsUnknownField(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"Ada","extra":true}`))

	_, err := decodeStrictJSONBodyWithRequiredFields[strictJSONHelperPayload](request)
	var unknownFieldErr *strictJSONUnknownFieldError
	if !errors.As(err, &unknownFieldErr) {
		t.Fatalf("expected unknown field error, got %v", err)
	}
	if unknownFieldErr.Field != "extra" {
		t.Fatalf("expected extra as unknown field, got %q", unknownFieldErr.Field)
	}
}

func TestDecodeStrictJSONBodyWithRequiredFieldsRejectsNullRequiredField(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"optional":null}`))

	_, err := decodeStrictJSONBodyWithRequiredFields[strictJSONHelperPayload](
		request,
		strictJSONFieldRequirement{Field: "optional"},
	)
	var missingFieldErr *strictJSONMissingFieldError
	if !errors.As(err, &missingFieldErr) {
		t.Fatalf("expected missing field error, got %v", err)
	}
	if missingFieldErr.Field != "optional" {
		t.Fatalf("expected optional as missing field, got %q", missingFieldErr.Field)
	}
}

func TestDecodeStrictJSONBodyWithRequiredFieldsAllowsNullWhenConfigured(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"optional":null}`))

	payload, err := decodeStrictJSONBodyWithRequiredFields[strictJSONHelperPayload](
		request,
		strictJSONFieldRequirement{Field: "optional", AllowNull: true},
	)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if payload.Optional != nil {
		t.Fatalf("expected nil optional value, got %#v", payload.Optional)
	}
}

func TestDecodeStrictJSONBodyWithRequiredFieldsDecodesEmptyBodyAsZeroValue(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader("   "))

	payload, err := decodeStrictJSONBodyWithRequiredFields[strictJSONHelperPayload](request)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if payload != (strictJSONHelperPayload{}) {
		t.Fatalf("expected zero-value payload, got %#v", payload)
	}
}

func TestDecodeStrictJSONBodyWithRequiredFieldsRejectsTrailingContent(t *testing.T) {
	t.Parallel()

	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"Ada"} {}`))

	_, err := decodeStrictJSONBodyWithRequiredFields[strictJSONHelperPayload](request)
	if err == nil || err.Error() != "unexpected trailing JSON content" {
		t.Fatalf("expected trailing content error, got %v", err)
	}
}

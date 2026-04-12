package plugins

import "testing"

// Version parsing and comparison should preserve the bounded PEP 440 ordering
// the plugin compatibility checks rely on.
func TestParseVersionComparison(t *testing.T) {
	cases := []struct {
		name  string
		left  string
		right string
		want  int
	}{
		{
			name:  "release segments pad with zeroes",
			left:  "1.0",
			right: "1.0.0",
			want:  0,
		},
		{
			name:  "development releases sort before prereleases",
			left:  "1.0.dev1",
			right: "1.0a1",
			want:  -1,
		},
		{
			name:  "prereleases sort before finals",
			left:  "1.0rc1",
			right: "1.0",
			want:  -1,
		},
		{
			name:  "post releases sort after finals",
			left:  "1.0.post1",
			right: "1.0",
			want:  1,
		},
		{
			name:  "epochs win before release comparison",
			left:  "1!0.1.0",
			right: "0!9.9.9",
			want:  1,
		},
	}

	for _, tc := range cases {
		left := mustParseVersionForTest(t, tc.left)
		right := mustParseVersionForTest(t, tc.right)
		if got := compareVersions(left, right); got != tc.want {
			t.Fatalf("%s: expected comparison %d, got %d", tc.name, tc.want, got)
		}
	}
}

// Specifier parsing should accept the bounded range operators we want for
// plugin compatibility and reject versions outside those ranges.
func TestParseSpecifierSetContains(t *testing.T) {
	cases := []struct {
		name      string
		specifier string
		version   string
		want      bool
	}{
		{
			name:      "simple lower bound",
			specifier: ">=0.0.0",
			version:   "0.1.0",
			want:      true,
		},
		{
			name:      "combined bounds",
			specifier: ">=1.0,<2.0",
			version:   "1.5.0",
			want:      true,
		},
		{
			name:      "combined bounds reject upper edge",
			specifier: ">=1.0,<2.0",
			version:   "2.0.0",
			want:      false,
		},
		{
			name:      "compatible release keeps prefix",
			specifier: "~=1.4.0",
			version:   "1.4.9",
			want:      true,
		},
		{
			name:      "compatible release rejects next prefix",
			specifier: "~=1.4.0",
			version:   "1.5.0",
			want:      false,
		},
		{
			name:      "prefix match accepts matching release",
			specifier: "==1.0.*",
			version:   "1.0.5",
			want:      true,
		},
		{
			name:      "prefix match rejects different release",
			specifier: "==1.0.*",
			version:   "1.1.0",
			want:      false,
		},
		{
			name:      "prefix exclusion rejects matching release",
			specifier: "!=1.0.*",
			version:   "1.0.5",
			want:      false,
		},
		{
			name:      "prefix exclusion keeps different release",
			specifier: "!=1.0.*",
			version:   "1.1.0",
			want:      true,
		},
		{
			name:      "plain ranges reject prereleases by default",
			specifier: "<1.0",
			version:   "1.0rc1",
			want:      false,
		},
		{
			name:      "explicit prerelease clauses allow prerelease hosts",
			specifier: ">=1.0rc1,<1.0",
			version:   "1.0rc1",
			want:      true,
		},
	}

	for _, tc := range cases {
		specifierSet, err := parseSpecifierSet(tc.specifier)
		if err != nil {
			t.Fatalf("%s: parse specifier set: %v", tc.name, err)
		}
		version := mustParseVersionForTest(t, tc.version)
		if got := specifierSet.Contains(version); got != tc.want {
			t.Fatalf("%s: expected contains=%t, got %t", tc.name, tc.want, got)
		}
	}
}

func TestParseVersionNormalizesLocalSegments(t *testing.T) {
	version := mustParseVersionForTest(t, "1.0+ABC.01-def_2")

	if len(version.local) != 4 {
		t.Fatalf("expected 4 local version segments, got %d", len(version.local))
	}
	if version.local[0].value != "abc" || version.local[0].numeric {
		t.Fatalf("expected first local segment to be normalized text, got %#v", version.local[0])
	}
	if !version.local[1].numeric || version.local[1].number != 1 {
		t.Fatalf("expected second local segment to be numeric 1, got %#v", version.local[1])
	}
	if version.local[2].value != "def" || version.local[2].numeric {
		t.Fatalf("expected third local segment to be normalized text, got %#v", version.local[2])
	}
	if !version.local[3].numeric || version.local[3].number != 2 {
		t.Fatalf("expected fourth local segment to be numeric 2, got %#v", version.local[3])
	}
}

// Invalid version and specifier forms should fail deterministically instead of
// being interpreted heuristically.
func TestParseVersionAndSpecifierRejectInvalidInputs(t *testing.T) {
	for _, raw := range []string{
		"",
		"not-a-version",
		"1..0",
		"1.",
		"1.0+",
		"1.0+abc..def",
		"1.0+abc$",
	} {
		if _, err := parseVersion(raw); err == nil {
			t.Fatalf("expected invalid version %q to fail", raw)
		}
	}

	for _, raw := range []string{
		">=",
		"abc",
		"~=1",
		"==1..0.*",
	} {
		if _, err := parseSpecifierSet(raw); err == nil {
			t.Fatalf("expected invalid specifier %q to fail", raw)
		}
	}
}

func mustParseVersionForTest(t *testing.T, raw string) parsedVersion {
	t.Helper()

	version, err := parseVersion(raw)
	if err != nil {
		t.Fatalf("parse version %q: %v", raw, err)
	}
	return version
}

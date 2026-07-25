package hostedmeasurement

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	ManifestSchemaVersion = 1
	maximumManifestBytes  = 32 * 1024
	maximumRunDuration    = 2 * time.Hour
	cleanupReserve        = 15 * time.Minute

	CleanupAuthority = "destroy all run-owned resources even after authorization expiry"
	BillingObserver  = "owner reviews Sprites and Fly billing after cleanup"
)

var (
	runIDPattern        = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`)
	organizationPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	regionPattern       = regexp.MustCompile(`^[a-z0-9]{3,8}$`)
)

var authorizedWorkload = []string{
	"hosted-candidate-b-http-sse",
	"controlled-unauthenticated-wake",
	"rotation-revocation-suspension-rate-limit-reconnect-redaction",
}

var excludedWorkload = []string{"websocket", "phase1c"}

type Manifest struct {
	SchemaVersion       int      `json:"schema_version"`
	RunID               string   `json:"run_id"`
	OwnerAuthorizedAt   string   `json:"owner_authorized_at"`
	StartDeadline       string   `json:"start_deadline"`
	CleanupDeadline     string   `json:"cleanup_deadline"`
	MaximumSpendUSD     string   `json:"maximum_spend_usd"`
	SpritesOrganization string   `json:"sprites_organization"`
	FlyOrganization     string   `json:"fly_organization"`
	FlyRegion           string   `json:"fly_region"`
	FlyAppName          string   `json:"fly_app_name"`
	ResourcePrefix      string   `json:"resource_prefix"`
	AuthorizedWorkload  []string `json:"authorized_workload"`
	ExcludedWorkload    []string `json:"excluded_workload"`
	CleanupAuthority    string   `json:"cleanup_authority"`
	BillingObserver     string   `json:"billing_observer"`
}

type Authorization struct {
	Manifest          Manifest
	ManifestDigest    string
	StateDirectory    string
	AuthorizedAt      time.Time
	StartDeadline     time.Time
	CleanupDeadline   time.Time
	MaximumSpendCents int64
}

type ValidationMode uint8

const (
	ValidateForStart ValidationMode = iota
	ValidateForCleanup
)

func LoadManifest(path string, now time.Time, mode ValidationMode) (Authorization, error) {
	if path == "" || !filepath.IsAbs(path) {
		return Authorization{}, errors.New("hosted measurement manifest path must be absolute")
	}
	if err := validatePrivateDirectory(filepath.Dir(path)); err != nil {
		return Authorization{}, err
	}
	data, err := readPrivateRegularFile(path, maximumManifestBytes, "hosted measurement manifest")
	if err != nil {
		return Authorization{}, err
	}
	if err := rejectDuplicateJSONFields(data); err != nil {
		return Authorization{}, fmt.Errorf("validate hosted measurement manifest JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Authorization{}, fmt.Errorf("decode hosted measurement manifest: %w", err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return Authorization{}, err
	}
	authorization, err := validateManifest(manifest, now, mode)
	if err != nil {
		return Authorization{}, err
	}
	digest := sha256.Sum256(data)
	authorization.ManifestDigest = hex.EncodeToString(digest[:])
	authorization.StateDirectory = filepath.Clean(filepath.Dir(path))
	return authorization, nil
}

func validateManifest(manifest Manifest, now time.Time, mode ValidationMode) (Authorization, error) {
	if mode != ValidateForStart && mode != ValidateForCleanup {
		return Authorization{}, errors.New("invalid hosted measurement manifest validation mode")
	}
	if err := validateManifestIdentity(manifest); err != nil {
		return Authorization{}, err
	}
	authorizedAt, startDeadline, cleanupDeadline, err := parseManifestTimes(manifest)
	if err != nil {
		return Authorization{}, err
	}
	if err := validateManifestWindow(authorizedAt, startDeadline, cleanupDeadline); err != nil {
		return Authorization{}, err
	}
	maximumSpendCents, err := parseUSD(manifest.MaximumSpendUSD)
	if err != nil {
		return Authorization{}, err
	}
	if mode == ValidateForStart {
		if err := validateStartClock(now, authorizedAt, startDeadline, cleanupDeadline); err != nil {
			return Authorization{}, err
		}
	}
	return Authorization{
		Manifest:          manifest,
		AuthorizedAt:      authorizedAt,
		StartDeadline:     startDeadline,
		CleanupDeadline:   cleanupDeadline,
		MaximumSpendCents: maximumSpendCents,
	}, nil
}

func validateManifestIdentity(manifest Manifest) error {
	if err := validateManifestNames(manifest); err != nil {
		return err
	}
	return validateManifestWorkloads(manifest)
}

func validateManifestNames(manifest Manifest) error {
	if manifest.SchemaVersion != ManifestSchemaVersion {
		return fmt.Errorf("manifest schema_version must be %d", ManifestSchemaVersion)
	}
	if !runIDPattern.MatchString(manifest.RunID) {
		return errors.New("manifest run_id must be 1-40 lowercase letters, digits, or interior hyphens")
	}
	if !organizationPattern.MatchString(manifest.SpritesOrganization) || !organizationPattern.MatchString(manifest.FlyOrganization) {
		return errors.New("manifest organizations must be lowercase provider slugs")
	}
	if !regionPattern.MatchString(manifest.FlyRegion) {
		return errors.New("manifest fly_region must be a lowercase provider region code")
	}
	wantName := "setta-gateway-" + manifest.RunID
	if manifest.FlyAppName != wantName || manifest.ResourcePrefix != wantName {
		return fmt.Errorf("manifest app name and resource prefix must both equal %q", wantName)
	}
	return nil
}

func validateManifestWorkloads(manifest Manifest) error {
	if !equalStrings(manifest.AuthorizedWorkload, authorizedWorkload) {
		return errors.New("manifest authorized_workload must exactly match the hosted Candidate B allowlist")
	}
	if !equalStrings(manifest.ExcludedWorkload, excludedWorkload) {
		return errors.New("manifest excluded_workload must exactly exclude websocket and phase1c")
	}
	if manifest.CleanupAuthority != CleanupAuthority || manifest.BillingObserver != BillingObserver {
		return errors.New("manifest cleanup authority and billing observer must match the fixed policy")
	}
	return nil
}

func parseManifestTimes(manifest Manifest) (time.Time, time.Time, time.Time, error) {
	authorizedAt, err := parseTime("owner_authorized_at", manifest.OwnerAuthorizedAt)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, err
	}
	startDeadline, err := parseTime("start_deadline", manifest.StartDeadline)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, err
	}
	cleanupDeadline, err := parseTime("cleanup_deadline", manifest.CleanupDeadline)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, err
	}
	return authorizedAt, startDeadline, cleanupDeadline, nil
}

func validateManifestWindow(authorizedAt time.Time, startDeadline time.Time, cleanupDeadline time.Time) error {
	if startDeadline.Before(authorizedAt) {
		return errors.New("manifest start_deadline must not precede owner authorization")
	}
	if !cleanupDeadline.After(startDeadline) {
		return errors.New("manifest cleanup_deadline must follow start_deadline")
	}
	if cleanupDeadline.After(authorizedAt.Add(maximumRunDuration)) {
		return errors.New("manifest cleanup_deadline must be no more than two hours after owner authorization")
	}
	return nil
}

func validateStartClock(now time.Time, authorizedAt time.Time, startDeadline time.Time, cleanupDeadline time.Time) error {
	if now.Before(authorizedAt) {
		return errors.New("owner authorization is not active yet")
	}
	if now.After(startDeadline) {
		return errors.New("hosted measurement start deadline has passed")
	}
	if !now.Add(cleanupReserve).Before(cleanupDeadline) {
		return errors.New("hosted measurement cannot preserve the 15-minute cleanup reserve")
	}
	return nil
}

func validatePrivateDirectory(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect hosted measurement state directory: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o077 != 0 {
		return errors.New("hosted measurement state directory must be a private non-symlink directory")
	}
	return nil
}

func readPrivateRegularFile(path string, maximumBytes int64, label string) ([]byte, error) {
	pathInfo, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("inspect %s: %w", label, err)
	}
	if !pathInfo.Mode().IsRegular() || pathInfo.Mode().Perm()&0o077 != 0 {
		return nil, fmt.Errorf("%s must be a private regular file", label)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", label, err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("inspect opened %s: %w", label, err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || !os.SameFile(pathInfo, info) {
		return nil, fmt.Errorf("%s changed or is not a private regular file", label)
	}
	data, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", label, err)
	}
	if int64(len(data)) > maximumBytes {
		return nil, fmt.Errorf("%s exceeds %d bytes", label, maximumBytes)
	}
	return data, nil
}

func rejectDuplicateJSONFields(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := consumeUniqueJSONValue(decoder); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("manifest must contain exactly one JSON value")
	}
	return nil
}

func consumeUniqueJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	switch delimiter {
	case '{':
		return consumeUniqueJSONObject(decoder)
	case '[':
		return consumeUniqueJSONArray(decoder)
	default:
		return errors.New("unexpected JSON delimiter")
	}
}

func consumeUniqueJSONObject(decoder *json.Decoder) error {
	seen := make(map[string]struct{})
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return err
		}
		key, ok := keyToken.(string)
		if !ok {
			return errors.New("object key must be a string")
		}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate field %q", key)
		}
		seen[key] = struct{}{}
		if err := consumeUniqueJSONValue(decoder); err != nil {
			return err
		}
	}
	return requireClosingDelimiter(decoder, '}')
}

func consumeUniqueJSONArray(decoder *json.Decoder) error {
	for decoder.More() {
		if err := consumeUniqueJSONValue(decoder); err != nil {
			return err
		}
	}
	return requireClosingDelimiter(decoder, ']')
}

func requireClosingDelimiter(decoder *json.Decoder, want json.Delim) error {
	end, err := decoder.Token()
	if err != nil || end != want {
		return errors.New("unterminated JSON container")
	}
	return nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("hosted measurement manifest must contain one JSON value")
	}
	return nil
}

func parseTime(field string, value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("manifest %s must be RFC3339: %w", field, err)
	}
	return parsed, nil
}

func parseUSD(value string) (int64, error) {
	parts, err := splitUSD(value)
	if err != nil {
		return 0, err
	}
	fraction := parts[1]
	for len(fraction) < 2 {
		fraction += "0"
	}
	dollars, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, errors.New("manifest maximum_spend_usd must be decimal digits")
	}
	cents, err := strconv.ParseInt(fraction, 10, 64)
	if err != nil {
		return 0, errors.New("manifest maximum_spend_usd must be decimal digits")
	}
	total := dollars*100 + cents
	if total <= 0 {
		return 0, errors.New("manifest maximum_spend_usd must be greater than zero")
	}
	return total, nil
}

func splitUSD(value string) ([2]string, error) {
	if value == "" || strings.HasPrefix(value, "+") || strings.HasPrefix(value, "-") {
		return [2]string{}, errors.New("manifest maximum_spend_usd must be a positive decimal string")
	}
	parts := strings.Split(value, ".")
	if len(parts) > 2 || len(parts[0]) == 0 || len(parts[0]) > 6 {
		return [2]string{}, errors.New("manifest maximum_spend_usd must use dollars with at most two decimal places")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
		if len(fraction) == 0 || len(fraction) > 2 {
			return [2]string{}, errors.New("manifest maximum_spend_usd must use dollars with at most two decimal places")
		}
	}
	return [2]string{parts[0], fraction}, nil
}

func equalStrings(got []string, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for index := range got {
		if got[index] != want[index] {
			return false
		}
	}
	return true
}

package backendconn

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"
)

const (
	RuntimeSchemaVersion = 1
	RuntimeFileMode      = 0o600
	RuntimeDirMode       = 0o700
	TokenEnv             = "SETTA_BACKEND_TOKEN"
	AddrEnv              = "SETTA_BACKEND_ADDR"
	AppDataDirEnv        = "SETTA_APP_DATA_DIR"
	AuthHeader           = "Authorization"
)

type RuntimeFile struct {
	SchemaVersion int    `json:"schemaVersion"`
	Addr          string `json:"addr"`
	Token         string `json:"token"`
	PID           int    `json:"pid"`
	AppDataDir    string `json:"appDataDir"`
	StartedAt     string `json:"startedAt"`
	Version       string `json:"version"`
}

func GenerateToken() (string, error) {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate backend token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(data[:]), nil
}

func RuntimeDir(appDataDir string) string {
	return filepath.Join(appDataDir, "runtime")
}

func RuntimeFilePath(appDataDir string) string {
	return filepath.Join(RuntimeDir(appDataDir), "backend.json")
}

func WriteRuntimeFile(record RuntimeFile) error {
	if err := validateRecordForWrite(record); err != nil {
		return err
	}
	dir := RuntimeDir(record.AppDataDir)
	if err := os.MkdirAll(dir, RuntimeDirMode); err != nil {
		return fmt.Errorf("create backend runtime directory: %w", err)
	}
	if err := os.Chmod(dir, RuntimeDirMode); err != nil {
		return fmt.Errorf("set backend runtime directory permissions: %w", err)
	}
	tmp, err := os.CreateTemp(dir, "backend-*.tmp")
	if err != nil {
		return fmt.Errorf("create backend runtime temp file: %w", err)
	}
	tmpPath := tmp.Name()
	removeTmp := true
	defer func() {
		if removeTmp {
			_ = os.Remove(tmpPath)
		}
	}()
	if err := tmp.Chmod(RuntimeFileMode); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("set backend runtime temp file permissions: %w", err)
	}
	encoder := json.NewEncoder(tmp)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(record); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write backend runtime temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close backend runtime temp file: %w", err)
	}
	path := RuntimeFilePath(record.AppDataDir)
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("replace backend runtime file: %w", err)
	}
	removeTmp = false
	return nil
}

func RemoveRuntimeFile(appDataDir string) error {
	path := RuntimeFilePath(appDataDir)
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove backend runtime file: %w", err)
	}
	return nil
}

func ReadRuntimeFile(path string) (RuntimeFile, error) {
	if err := CheckOwnerOnlyFile(path); err != nil {
		return RuntimeFile{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return RuntimeFile{}, err
	}
	defer file.Close()
	var record RuntimeFile
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&record); err != nil {
		return RuntimeFile{}, fmt.Errorf("decode backend runtime file %s: %w", path, err)
	}
	return record, nil
}

func ValidateRuntimeRecord(record RuntimeFile, path string) error {
	if record.SchemaVersion != RuntimeSchemaVersion {
		return fmt.Errorf("backend runtime file %s has schema version %d, want %d", path, record.SchemaVersion, RuntimeSchemaVersion)
	}
	if record.AppDataDir == "" {
		return fmt.Errorf("backend runtime file %s is missing appDataDir", path)
	}
	if record.Addr == "" {
		return fmt.Errorf("backend runtime file %s is missing addr", path)
	}
	if err := ValidateLoopbackHTTPURL(record.Addr); err != nil {
		return fmt.Errorf("backend runtime file %s has invalid addr: %w", path, err)
	}
	if record.Token == "" {
		return fmt.Errorf("backend runtime file %s is missing token", path)
	}
	if record.PID <= 0 {
		return fmt.Errorf("backend runtime file %s has invalid pid %d", path, record.PID)
	}
	if alive, supported := ProcessAlive(record.PID); supported && !alive {
		return fmt.Errorf("backend runtime file %s is stale: process %d is not running", path, record.PID)
	}
	return nil
}

func ValidateLoopbackHTTPURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("parse URL: %w", err)
	}
	if parsed.Scheme != "http" {
		return fmt.Errorf("URL must use http://: %s", rawURL)
	}
	if parsed.Host == "" {
		return fmt.Errorf("URL host is required: %s", rawURL)
	}
	if !IsLoopbackHost(parsed.Hostname()) {
		return fmt.Errorf("URL host must be loopback: %s", parsed.Hostname())
	}
	return nil
}

func IsLoopbackHost(hostname string) bool {
	if strings.EqualFold(hostname, "localhost") {
		return true
	}
	if strings.Contains(hostname, "%") {
		return false
	}
	addr, err := netip.ParseAddr(hostname)
	if err == nil {
		return addr.IsLoopback()
	}
	return false
}

func CheckOwnerOnlyFile(path string) error {
	if goruntime.GOOS == "windows" {
		return nil
	}
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("backend runtime file %s is a directory", path)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return fmt.Errorf("backend runtime file %s permissions must be owner-only", path)
	}
	return nil
}

func BearerToken(token string) string {
	return "Bearer " + token
}

func validateRecordForWrite(record RuntimeFile) error {
	if record.SchemaVersion != RuntimeSchemaVersion {
		return fmt.Errorf("backend runtime schema version must be %d", RuntimeSchemaVersion)
	}
	if record.AppDataDir == "" {
		return errors.New("backend runtime app data directory is required")
	}
	if record.Token == "" {
		return errors.New("backend runtime token is required")
	}
	if record.PID <= 0 {
		return errors.New("backend runtime pid is required")
	}
	if err := ValidateLoopbackHTTPURL(record.Addr); err != nil {
		return err
	}
	return nil
}

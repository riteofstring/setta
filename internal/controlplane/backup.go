package controlplane

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const (
	controlPlaneBackupSchemaVersion = 1
	controlPlaneBackupManifestName  = "manifest.json"
	controlPlaneBackupSecretsName   = "runtime-secrets"
	maximumBackupManifestBytes      = 1024 * 1024
)

type BackupSecret struct {
	Reference string `json:"reference"`
	SHA256    string `json:"sha256"`
}

type BackupManifest struct {
	SchemaVersion             int            `json:"schema_version"`
	ControlPlaneSchemaVersion int            `json:"control_plane_schema_version"`
	CreatedAt                 string         `json:"created_at"`
	DatabaseSHA256            string         `json:"database_sha256"`
	Secrets                   []BackupSecret `json:"secrets"`
}

func CreateBackup(
	ctx context.Context,
	store *Store,
	secrets *FileSecretStore,
	destination string,
) (BackupManifest, error) {
	if ctx == nil || store == nil || secrets == nil {
		return BackupManifest{}, errors.New("control-plane backup requires context, store, and file secret store")
	}
	destination, err := validateNewBackupDirectory(destination, store, secrets)
	if err != nil {
		return BackupManifest{}, err
	}
	secretDirectory, err := initializeBackupDirectories(destination)
	if err != nil {
		return BackupManifest{}, err
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	secrets.mu.RLock()
	defer secrets.mu.RUnlock()
	return createBackupLocked(ctx, store, secrets, destination, secretDirectory)
}

func initializeBackupDirectories(destination string) (string, error) {
	if err := os.Mkdir(destination, 0o700); err != nil {
		return "", fmt.Errorf("create control-plane backup directory: %w", err)
	}
	secretDirectory := filepath.Join(destination, controlPlaneBackupSecretsName)
	if err := os.Mkdir(secretDirectory, 0o700); err != nil {
		return "", fmt.Errorf("create control-plane backup secret directory: %w", err)
	}
	return secretDirectory, nil
}

func createBackupLocked(
	ctx context.Context,
	store *Store,
	secrets *FileSecretStore,
	destination string,
	secretDirectory string,
) (BackupManifest, error) {
	if store.closed {
		return BackupManifest{}, errors.New("control-plane store is closed")
	}
	references, err := store.referencedSecretReferencesLocked(ctx)
	if err != nil {
		return BackupManifest{}, err
	}
	databaseSHA256, err := createDatabaseBackup(ctx, store, destination)
	if err != nil {
		return BackupManifest{}, err
	}
	backupSecrets, err := createSecretBackups(ctx, secrets, secretDirectory, references)
	if err != nil {
		return BackupManifest{}, err
	}
	manifest := BackupManifest{
		SchemaVersion:             controlPlaneBackupSchemaVersion,
		ControlPlaneSchemaVersion: controlPlaneStoreVersion,
		CreatedAt:                 store.clock().UTC().Format(time.RFC3339Nano),
		DatabaseSHA256:            databaseSHA256,
		Secrets:                   backupSecrets,
	}
	if err := writeBackupManifest(destination, manifest); err != nil {
		return BackupManifest{}, err
	}
	if err := syncDirectory(secretDirectory); err != nil {
		return BackupManifest{}, err
	}
	if err := syncDirectory(destination); err != nil {
		return BackupManifest{}, err
	}
	return manifest, nil
}

func createDatabaseBackup(
	ctx context.Context,
	store *Store,
	destination string,
) (string, error) {
	databasePath := filepath.Join(destination, controlPlaneDatabaseName)
	if _, err := store.db.ExecContext(ctx, "VACUUM INTO ?", databasePath); err != nil {
		return "", fmt.Errorf("snapshot control-plane database: %w", err)
	}
	if err := os.Chmod(databasePath, 0o600); err != nil {
		return "", fmt.Errorf("restrict control-plane backup database: %w", err)
	}
	return fileSHA256(databasePath)
}

func createSecretBackups(
	ctx context.Context,
	secrets *FileSecretStore,
	secretDirectory string,
	references []string,
) ([]BackupSecret, error) {
	backupSecrets := make([]BackupSecret, 0, len(references))
	for _, reference := range references {
		secret, err := secrets.readSecret(ctx, reference)
		if err != nil {
			return nil, fmt.Errorf("read referenced control-plane secret %q: %w", reference, err)
		}
		path := filepath.Join(secretDirectory, reference+".secret")
		if err := writeExclusivePrivateFile(path, secret); err != nil {
			return nil, err
		}
		backupSecrets = append(backupSecrets, BackupSecret{
			Reference: reference,
			SHA256:    byteSHA256(secret),
		})
	}
	return backupSecrets, nil
}

func writeBackupManifest(destination string, manifest BackupManifest) error {
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode control-plane backup manifest: %w", err)
	}
	encoded = append(encoded, '\n')
	return writeExclusivePrivateFile(filepath.Join(destination, controlPlaneBackupManifestName), encoded)
}

func RestoreBackup(
	ctx context.Context,
	source string,
	dataDirectory string,
	secretDirectory string,
) (BackupManifest, error) {
	if ctx == nil {
		return BackupManifest{}, errors.New("control-plane restore context is required")
	}
	source, err := requirePrivateBackupDirectory(source)
	if err != nil {
		return BackupManifest{}, err
	}
	dataDirectory, secretDirectory, err = validateRestoreDestinations(source, dataDirectory, secretDirectory)
	if err != nil {
		return BackupManifest{}, err
	}
	manifest, err := loadBackupManifest(source)
	if err != nil {
		return BackupManifest{}, err
	}
	if err := validateBackupContents(source, manifest); err != nil {
		return BackupManifest{}, err
	}
	if err := restoreBackupFiles(source, dataDirectory, secretDirectory, manifest); err != nil {
		return BackupManifest{}, err
	}
	if err := verifyRestoredBackup(ctx, dataDirectory, secretDirectory, manifest); err != nil {
		return BackupManifest{}, err
	}
	return manifest, nil
}

func restoreBackupFiles(
	source string,
	dataDirectory string,
	secretDirectory string,
	manifest BackupManifest,
) error {
	if err := os.Mkdir(dataDirectory, 0o700); err != nil {
		return fmt.Errorf("create restored control-plane data directory: %w", err)
	}
	if err := copyPrivateFile(
		filepath.Join(source, controlPlaneDatabaseName),
		filepath.Join(dataDirectory, controlPlaneDatabaseName),
	); err != nil {
		return err
	}
	if err := os.Mkdir(secretDirectory, 0o700); err != nil {
		return fmt.Errorf("create restored control-plane secret directory: %w", err)
	}
	for _, secret := range manifest.Secrets {
		if err := copyPrivateFile(
			filepath.Join(source, controlPlaneBackupSecretsName, secret.Reference+".secret"),
			filepath.Join(secretDirectory, secret.Reference+".secret"),
		); err != nil {
			return err
		}
	}
	if err := syncDirectory(dataDirectory); err != nil {
		return err
	}
	if err := syncDirectory(secretDirectory); err != nil {
		return err
	}
	return nil
}

func (store *Store) referencedSecretReferencesLocked(ctx context.Context) ([]string, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT DISTINCT credential_secret_ref
FROM runtimes
ORDER BY credential_secret_ref
`)
	if err != nil {
		return nil, fmt.Errorf("list referenced control-plane secrets: %w", err)
	}
	defer rows.Close()
	var references []string
	for rows.Next() {
		var reference string
		if err := rows.Scan(&reference); err != nil {
			return nil, fmt.Errorf("scan referenced control-plane secret: %w", err)
		}
		if err := validateSecretReference(reference); err != nil {
			return nil, err
		}
		references = append(references, reference)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate referenced control-plane secrets: %w", err)
	}
	return references, nil
}

func validateNewBackupDirectory(
	destination string,
	store *Store,
	secrets *FileSecretStore,
) (string, error) {
	if destination == "" || !filepath.IsAbs(destination) {
		return "", errors.New("control-plane backup destination must be absolute")
	}
	destination = filepath.Clean(destination)
	if pathsOverlap(destination, filepath.Dir(store.dbPath)) ||
		pathsOverlap(destination, secrets.directory) {
		return "", errors.New("control-plane backup destination must be outside data and secret directories")
	}
	if _, err := os.Lstat(destination); !errors.Is(err, os.ErrNotExist) {
		if err == nil {
			return "", errors.New("control-plane backup destination already exists")
		}
		return "", fmt.Errorf("inspect control-plane backup destination: %w", err)
	}
	return destination, nil
}

func validateRestoreDestinations(
	source string,
	dataDirectory string,
	secretDirectory string,
) (string, string, error) {
	if dataDirectory == "" || !filepath.IsAbs(dataDirectory) ||
		secretDirectory == "" || !filepath.IsAbs(secretDirectory) {
		return "", "", errors.New("control-plane restore destinations must be absolute")
	}
	dataDirectory = filepath.Clean(dataDirectory)
	secretDirectory = filepath.Clean(secretDirectory)
	if pathsOverlap(source, dataDirectory) ||
		pathsOverlap(source, secretDirectory) ||
		pathsOverlap(dataDirectory, secretDirectory) {
		return "", "", errors.New("control-plane backup, data, and secret directories must not overlap")
	}
	if err := requireAbsentRestoreDestinations(dataDirectory, secretDirectory); err != nil {
		return "", "", err
	}
	return dataDirectory, secretDirectory, nil
}

func requireAbsentRestoreDestinations(destinations ...string) error {
	for _, destination := range destinations {
		if _, err := os.Lstat(destination); !errors.Is(err, os.ErrNotExist) {
			if err == nil {
				return errors.New("control-plane restore destination already exists")
			}
			return fmt.Errorf("inspect control-plane restore destination: %w", err)
		}
	}
	return nil
}

func pathsOverlap(first string, second string) bool {
	first = filepath.Clean(first)
	second = filepath.Clean(second)
	return first == second ||
		strings.HasPrefix(first, second+string(filepath.Separator)) ||
		strings.HasPrefix(second, first+string(filepath.Separator))
}

func requirePrivateBackupDirectory(path string) (string, error) {
	if path == "" || !filepath.IsAbs(path) {
		return "", errors.New("control-plane backup source must be absolute")
	}
	path = filepath.Clean(path)
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect control-plane backup source: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o077 != 0 {
		return "", errors.New("control-plane backup source must be a private non-symlink directory")
	}
	return path, nil
}

func loadBackupManifest(source string) (BackupManifest, error) {
	data, err := readPrivateBackupFile(
		filepath.Join(source, controlPlaneBackupManifestName),
		maximumBackupManifestBytes,
	)
	if err != nil {
		return BackupManifest{}, err
	}
	if err := rejectDuplicateBackupJSONFields(data); err != nil {
		return BackupManifest{}, fmt.Errorf("validate control-plane backup manifest: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest BackupManifest
	if err := decoder.Decode(&manifest); err != nil {
		return BackupManifest{}, fmt.Errorf("decode control-plane backup manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return BackupManifest{}, errors.New("control-plane backup manifest must contain one JSON value")
	}
	if err := validateBackupManifest(manifest); err != nil {
		return BackupManifest{}, err
	}
	return manifest, nil
}

func validateBackupManifest(manifest BackupManifest) error {
	if manifest.SchemaVersion != controlPlaneBackupSchemaVersion ||
		manifest.ControlPlaneSchemaVersion != controlPlaneStoreVersion {
		return errors.New("control-plane backup schema version is unsupported")
	}
	if _, err := time.Parse(time.RFC3339Nano, manifest.CreatedAt); err != nil {
		return errors.New("control-plane backup created_at is invalid")
	}
	if !validSHA256(manifest.DatabaseSHA256) {
		return errors.New("control-plane backup database checksum is invalid")
	}
	previous := ""
	for _, secret := range manifest.Secrets {
		if err := validateSecretReference(secret.Reference); err != nil {
			return err
		}
		if secret.Reference <= previous {
			return errors.New("control-plane backup secrets must be unique and sorted")
		}
		if !validSHA256(secret.SHA256) {
			return errors.New("control-plane backup secret checksum is invalid")
		}
		previous = secret.Reference
	}
	return nil
}

func validateBackupContents(source string, manifest BackupManifest) error {
	if err := validateBackupRootEntries(source); err != nil {
		return err
	}
	databasePath := filepath.Join(source, controlPlaneDatabaseName)
	checksum, err := fileSHA256(databasePath)
	if err != nil {
		return err
	}
	if checksum != manifest.DatabaseSHA256 {
		return errors.New("control-plane backup database checksum does not match")
	}
	return validateBackupSecretFiles(source, manifest.Secrets)
}

func validateBackupRootEntries(source string) error {
	entries, err := os.ReadDir(source)
	if err != nil {
		return fmt.Errorf("read control-plane backup directory: %w", err)
	}
	wantEntries := []string{
		controlPlaneDatabaseName,
		controlPlaneBackupManifestName,
		controlPlaneBackupSecretsName,
	}
	if len(entries) != len(wantEntries) {
		return errors.New("control-plane backup files differ from the manifest contract")
	}
	for index, entry := range entries {
		if entry.Name() != wantEntries[index] {
			return errors.New("control-plane backup files differ from the manifest contract")
		}
	}
	return nil
}

func validateBackupSecretFiles(source string, secrets []BackupSecret) error {
	secretDirectory, err := requirePrivateBackupDirectory(
		filepath.Join(source, controlPlaneBackupSecretsName),
	)
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(secretDirectory)
	if err != nil {
		return fmt.Errorf("read control-plane backup secrets: %w", err)
	}
	if len(entries) != len(secrets) {
		return errors.New("control-plane backup secret files differ from the manifest")
	}
	for index, secret := range secrets {
		wantName := secret.Reference + ".secret"
		if entries[index].Name() != wantName {
			return errors.New("control-plane backup secret files differ from the manifest")
		}
		if err := validateBackupSecret(filepath.Join(secretDirectory, wantName), secret); err != nil {
			return err
		}
	}
	return nil
}

func validateBackupSecret(path string, secret BackupSecret) error {
	data, err := readPrivateBackupFile(path, maximumSecretBytes)
	if err != nil {
		return err
	}
	if err := validateRuntimeCredential(data); err != nil {
		return err
	}
	if byteSHA256(data) != secret.SHA256 {
		return errors.New("control-plane backup secret checksum does not match")
	}
	return nil
}

func verifyRestoredBackup(
	ctx context.Context,
	dataDirectory string,
	secretDirectory string,
	manifest BackupManifest,
) error {
	store, err := OpenStore(StoreConfig{Directory: dataDirectory})
	if err != nil {
		return fmt.Errorf("open restored control-plane store: %w", err)
	}
	store.mu.Lock()
	references, referencesErr := store.referencedSecretReferencesLocked(ctx)
	store.mu.Unlock()
	closeErr := store.Close()
	if referencesErr != nil {
		return referencesErr
	}
	if closeErr != nil {
		return closeErr
	}
	wantReferences := make([]string, len(manifest.Secrets))
	for index, secret := range manifest.Secrets {
		wantReferences[index] = secret.Reference
	}
	if !slices.Equal(references, wantReferences) {
		return errors.New("restored control-plane secret references differ from the backup manifest")
	}
	secrets, err := OpenFileSecretStore(secretDirectory)
	if err != nil {
		return err
	}
	for _, reference := range references {
		if _, err := secrets.ReadSecret(ctx, reference); err != nil {
			return fmt.Errorf("read restored control-plane secret %q: %w", reference, err)
		}
	}
	return nil
}

func readPrivateBackupFile(path string, maximumBytes int64) ([]byte, error) {
	file, err := openPrivateBackupFile(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read control-plane backup file: %w", err)
	}
	if int64(len(data)) > maximumBytes {
		return nil, errors.New("control-plane backup file exceeds its size limit")
	}
	return data, nil
}

func openPrivateBackupFile(path string) (*os.File, error) {
	pathInfo, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("inspect control-plane backup file: %w", err)
	}
	if !pathInfo.Mode().IsRegular() || pathInfo.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("control-plane backup file must be a private regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open control-plane backup file: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("inspect opened control-plane backup file: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || !os.SameFile(pathInfo, info) {
		_ = file.Close()
		return nil, errors.New("control-plane backup file changed or is not private")
	}
	return file, nil
}

func copyPrivateFile(source string, destination string) error {
	input, err := openPrivateBackupFile(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create restored control-plane file: %w", err)
	}
	if _, err := io.Copy(output, input); err != nil {
		_ = output.Close()
		return fmt.Errorf("copy restored control-plane file: %w", err)
	}
	if err := output.Sync(); err != nil {
		_ = output.Close()
		return fmt.Errorf("sync restored control-plane file: %w", err)
	}
	if err := output.Close(); err != nil {
		return fmt.Errorf("close restored control-plane file: %w", err)
	}
	return nil
}

func writeExclusivePrivateFile(path string, data []byte) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create private control-plane backup file: %w", err)
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return fmt.Errorf("write private control-plane backup file: %w", err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("sync private control-plane backup file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close private control-plane backup file: %w", err)
	}
	return nil
}

func fileSHA256(path string) (string, error) {
	file, err := openPrivateBackupFile(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("checksum control-plane backup file: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func byteSHA256(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func validSHA256(value string) bool {
	if len(value) != sha256.Size*2 || strings.ToLower(value) != value {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size
}

func rejectDuplicateBackupJSONFields(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := consumeUniqueBackupJSONValue(decoder); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("backup manifest must contain exactly one JSON value")
	}
	return nil
}

func consumeUniqueBackupJSONValue(decoder *json.Decoder) error {
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
		return consumeUniqueBackupJSONObject(decoder)
	case '[':
		return consumeUniqueBackupJSONArray(decoder)
	default:
		return errors.New("unexpected backup manifest delimiter")
	}
}

func consumeUniqueBackupJSONObject(decoder *json.Decoder) error {
	seen := map[string]struct{}{}
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return err
		}
		key, ok := keyToken.(string)
		if !ok {
			return errors.New("backup manifest object key is not a string")
		}
		if _, found := seen[key]; found {
			return fmt.Errorf("duplicate backup manifest field %q", key)
		}
		seen[key] = struct{}{}
		if err := consumeUniqueBackupJSONValue(decoder); err != nil {
			return err
		}
	}
	_, err := decoder.Token()
	return err
}

func consumeUniqueBackupJSONArray(decoder *json.Decoder) error {
	for decoder.More() {
		if err := consumeUniqueBackupJSONValue(decoder); err != nil {
			return err
		}
	}
	_, err := decoder.Token()
	return err
}

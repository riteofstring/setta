package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type protocolSnapshot struct {
	ProtocolVersion int    `json:"protocolVersion"`
	SchemaHash      string `json:"schemaHash"`
}

func writeProtocolSnapshot(path string, specs contractSpec) error {
	snapshot := protocolSnapshot{
		ProtocolVersion: specs.ProtocolVersion,
		SchemaHash:      specs.SchemaHash,
	}
	if err := validateProtocolSnapshotUpdate(path, snapshot); err != nil {
		return err
	}
	payload, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal protocol snapshot: %w", err)
	}
	payload = append(payload, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create protocol snapshot directory: %w", err)
	}
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

func validateProtocolSnapshotUpdate(path string, next protocolSnapshot) error {
	payload, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	var previous protocolSnapshot
	if err := json.Unmarshal(payload, &previous); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	if previous.SchemaHash != next.SchemaHash && next.ProtocolVersion <= previous.ProtocolVersion {
		return fmt.Errorf(
			"contract schema hash changed from %s to %s without a protocol version bump above %d",
			previous.SchemaHash,
			next.SchemaHash,
			previous.ProtocolVersion,
		)
	}
	return nil
}

package httpapi

import (
	"encoding/json"
	"os"
	"testing"
)

type contractSchemaSnapshot struct {
	ProtocolVersion int    `json:"protocolVersion"`
	SchemaHash      string `json:"schemaHash"`
}

func TestContractSchemaSnapshotMatchesCurrentRegistry(t *testing.T) {
	payload, err := os.ReadFile("contract_schema_snapshot.json")
	if err != nil {
		t.Fatalf("read contract schema snapshot: %v", err)
	}
	var snapshot contractSchemaSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		t.Fatalf("parse contract schema snapshot: %v", err)
	}
	currentHash, err := ContractSchemaHash(Contracts())
	if err != nil {
		t.Fatalf("hash current contracts: %v", err)
	}
	if snapshot.ProtocolVersion != ProtocolVersion {
		t.Fatalf(
			"snapshot protocolVersion = %d, want %d; run ./scripts/go.sh run ./cmd/generate-contracts",
			snapshot.ProtocolVersion,
			ProtocolVersion,
		)
	}
	if snapshot.SchemaHash != currentHash {
		t.Fatalf(
			"snapshot schemaHash = %s, want %s; bump ProtocolVersion before regenerating if the contract change is breaking",
			snapshot.SchemaHash,
			currentHash,
		)
	}
}

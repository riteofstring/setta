package hostedmeasurement

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func TestFlyPublicIPPreparerInventoriesBeforeAndAfterOneAllocation(t *testing.T) {
	runner := &scriptedFlyCommandRunner{outputs: [][]byte{[]byte(`[]`), nil, []byte(`[{"address":"66.1.2.3","type":"shared_v4"}]`)}}
	preparer, err := NewFlyPublicIPPreparer(runner, []byte(testInventoryToken), []byte(testMutationToken))
	if err != nil {
		t.Fatal(err)
	}
	if err := preparer.EnsureSharedIPv4(context.Background(), "setta-gateway-night"); err != nil {
		t.Fatal(err)
	}
	want := [][]string{
		{"ips", "list", "--app", "setta-gateway-night", "--json"},
		{"ips", "allocate-v4", "--shared", "--yes", "--app", "setta-gateway-night"},
		{"ips", "list", "--app", "setta-gateway-night", "--json"},
	}
	if !reflect.DeepEqual(runner.arguments, want) {
		t.Fatalf("arguments = %v, want %v", runner.arguments, want)
	}
	if runner.environments[0]["FLY_API_TOKEN"] != testInventoryToken || runner.environments[1]["FLY_API_TOKEN"] != testMutationToken {
		t.Fatal("public IP preparer used the wrong scoped credential")
	}
}

func TestFlyPublicIPPreparerIsIdempotentAndFailsClosed(t *testing.T) {
	runner := &scriptedFlyCommandRunner{outputs: [][]byte{[]byte(`[{"address":"66.1.2.3","type":"shared_v4"}]`)}}
	preparer, err := NewFlyPublicIPPreparer(runner, []byte(testInventoryToken), []byte(testMutationToken))
	if err != nil {
		t.Fatal(err)
	}
	if err := preparer.EnsureSharedIPv4(context.Background(), "setta-gateway-night"); err != nil || len(runner.arguments) != 1 {
		t.Fatalf("idempotent ensure = %v, commands = %v", err, runner.arguments)
	}
	runner = &scriptedFlyCommandRunner{outputs: [][]byte{[]byte(`[{"address":"a","type":"shared_v4"},{"address":"b","type":"shared_v4"}]`)}}
	preparer, _ = NewFlyPublicIPPreparer(runner, []byte(testInventoryToken), []byte(testMutationToken))
	if err := preparer.EnsureSharedIPv4(context.Background(), "setta-gateway-night"); !errors.Is(err, ErrAmbiguousInventory) {
		t.Fatalf("ambiguous inventory error = %v", err)
	}
}

type scriptedFlyCommandRunner struct {
	outputs      [][]byte
	arguments    [][]string
	environments []map[string]string
}

func (runner *scriptedFlyCommandRunner) Run(_ context.Context, command FlyCommand) ([]byte, error) {
	runner.arguments = append(runner.arguments, append([]string(nil), command.Arguments...))
	runner.environments = append(runner.environments, command.Environment)
	if len(runner.outputs) == 0 {
		return nil, errors.New("unexpected command")
	}
	output := runner.outputs[0]
	runner.outputs = runner.outputs[1:]
	return output, nil
}

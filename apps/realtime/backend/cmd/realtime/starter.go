package main

import (
	"encoding/json"
	"errors"
	"os"

	"github.com/setta/local-backend/projectfs"
	"github.com/setta/realtime/backend/internal/contracts"
	"github.com/setta/realtime/backend/internal/project"
)

const starterSource = `count = 0


def increment(step=1):
    global count
    count += step
    return {"value": count}


handlers = {"increment": increment}
`

func initializeEntrypoint(projectRoot string, projects *project.Store) error {
	root, err := projectfs.Open(projectRoot)
	if err != nil {
		return err
	}
	defer root.Close()
	if err := root.WriteExclusive("app.py", []byte(starterSource), 1<<20, 0o644); err != nil && !errors.Is(err, os.ErrExist) {
		return err
	}
	snapshot, err := projects.Snapshot()
	if err != nil {
		return err
	}
	operation, err := json.Marshal(contracts.UpsertSectionOperation{
		Operation: "upsertSection",
		Section: contracts.Section{
			ID: "code", Kind: "code", Name: "app.py",
			Width: contracts.SizeValue{Value: 640}, Height: contracts.SizeValue{Value: 420},
			Children: []string{}, Data: json.RawMessage(`{"source":"entrypoint"}`),
		},
		Layout: &contracts.TopLevelSectionLayout{X: 40, Y: 40, ZIndex: 1},
	})
	if err != nil {
		return err
	}
	_, err = projects.Apply(contracts.ApplyRequest{
		ProjectID: snapshot.ID, ExpectedRevision: snapshot.Revision,
		Operations: []json.RawMessage{operation},
	})
	return err
}

package coordinator

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
)

func TestCaptureGeneratedProgramRequiresTheExactPublishedRevision(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project.json")
	application, err := Open(context.Background(), Options{
		ProjectPath:  path,
		Create:       true,
		IDGenerator:  sequenceIDs("project:terminal"),
		Materializer: newMaterialization(t, path),
		Provider:     readyProvider(),
	})
	if err != nil {
		t.Fatalf("open coordinator: %v", err)
	}
	t.Cleanup(func() {
		if err := application.Close(); err != nil {
			t.Errorf("close coordinator: %v", err)
		}
	})

	before := application.Snapshot()
	program, err := application.CaptureGeneratedProgram(context.Background(), before.State.Project.ID, before.State.Project.Revision)
	if err != nil {
		t.Fatalf("capture generated program: %v", err)
	}
	if program.ProjectID != before.State.Project.ID || program.Revision != before.State.Project.Revision || program.Code != before.Rendered.Code {
		t.Fatalf("generated program = %#v, snapshot = %#v", program, before)
	}
	after := application.Snapshot()
	if after.State.Project.Revision != before.State.Project.Revision || after.Rendered.Code != before.Rendered.Code {
		t.Fatalf("read-only capture changed the published generated program: before %#v after %#v", before, after)
	}

	if _, err := application.CaptureGeneratedProgram(context.Background(), before.State.Project.ID, before.State.Project.Revision+1); !errors.Is(err, aggregate.ErrRevisionConflict) {
		t.Fatalf("stale generated program capture error = %v, want revision conflict", err)
	}
	if _, err := application.CaptureGeneratedProgram(context.Background(), "project:missing", before.State.Project.Revision); !errors.Is(err, aggregate.ErrProjectNotFound) {
		t.Fatalf("unknown-project generated program capture error = %v, want not found", err)
	}
}

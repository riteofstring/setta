package projectstate

import "testing"

func TestProjectRemoveWatchCodePythonImportPreservesRemainingPrefix(t *testing.T) {
	t.Parallel()

	project := projectWithPythonCodegenTarget()
	setProjectPythonCodegenPrefix(t, &project, "import math\nfrom pkg.watched import watched\nstate = SettaState()\n")

	removed, err := project.removeWatchCodePythonImport("pkg.watched", "watched", "watched")
	if err != nil {
		t.Fatalf("removeWatchCodePythonImport returned error: %v", err)
	}
	if !removed {
		t.Fatal("expected matching watch code import to be removed")
	}

	if got := projectPythonCodegenPrefix(t, project); got != "import math\nstate = SettaState()\n" {
		t.Fatalf("expected remaining prefix to stay normalized, got %q", got)
	}
}

func TestProjectRemoveWatchCodePythonImportNoopsForMissingOrInvalidImport(t *testing.T) {
	t.Parallel()

	project := projectWithPythonCodegenTarget()
	originalPrefix := "import math\nfrom pkg.watched import watched\n"
	setProjectPythonCodegenPrefix(t, &project, originalPrefix)

	removed, err := project.removeWatchCodePythonImport("pkg.watched", "missing", "missing")
	if err != nil {
		t.Fatalf("removeWatchCodePythonImport missing import returned error: %v", err)
	}
	if removed {
		t.Fatal("did not expect missing watch code import to be removed")
	}

	removed, err = project.removeWatchCodePythonImport(".relative", "watched", "watched")
	if err != nil {
		t.Fatalf("removeWatchCodePythonImport invalid path returned error: %v", err)
	}
	if removed {
		t.Fatal("did not expect invalid watch code import path to report a removal")
	}

	if got := projectPythonCodegenPrefix(t, project); got != originalPrefix {
		t.Fatalf("expected watch code prefix to remain unchanged, got %q", got)
	}
}

func setProjectPythonCodegenPrefix(t *testing.T, project *Project, prefix string) {
	t.Helper()

	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("read python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	target.GenCodePrefix = prefix
	if err := project.SetPythonCodegenTarget(target); err != nil {
		t.Fatalf("set python target: %v", err)
	}
}

func projectPythonCodegenPrefix(t *testing.T, project Project) string {
	t.Helper()

	target, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("read python target: %v", err)
	}
	if !ok {
		t.Fatal("expected python target")
	}
	return target.GenCodePrefix
}

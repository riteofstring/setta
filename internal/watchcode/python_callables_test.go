package watchcode

import "testing"

func TestParsePythonCallablesParsesTopLevelDefsAndClasses(t *testing.T) {
	t.Parallel()

	// Top-level defs, async defs, and decorated classes are the supported watch-code inputs.
	callables, parsed, err := ParsePythonCallables(`
def alpha(value):
    return value

async def beta(flag):
    return flag

class Widget:
    def __init__(self, size):
        self.size = size

@decorator
def gamma():
    return 1

@decorator
class Gadget:
    pass
`, "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse python callables: %v", err)
	}
	if !parsed {
		t.Fatal("expected parser success")
	}
	if len(callables) != 5 {
		t.Fatalf("expected five callables, got %#v", callables)
	}

	byIdentity := map[string]CallableInfo{}
	for _, callable := range callables {
		byIdentity[callable.Identity] = callable
	}

	alpha, ok := byIdentity["pkg.watch_me.alpha:function"]
	if !ok {
		t.Fatalf("expected alpha callable, got %#v", byIdentity)
	}
	if alpha.Kind != CallableKindFunction {
		t.Fatalf("expected alpha function kind, got %q", alpha.Kind)
	}

	beta, ok := byIdentity["pkg.watch_me.beta:async_function"]
	if !ok {
		t.Fatalf("expected beta async callable, got %#v", byIdentity)
	}
	if beta.Kind != CallableKindAsyncFunction {
		t.Fatalf("expected beta async kind, got %q", beta.Kind)
	}

	widget, ok := byIdentity["pkg.watch_me.Widget:class_init"]
	if !ok {
		t.Fatalf("expected widget class callable, got %#v", byIdentity)
	}
	if widget.Kind != CallableKindClassInit {
		t.Fatalf("expected widget class_init kind, got %q", widget.Kind)
	}

	gamma, ok := byIdentity["pkg.watch_me.gamma:function"]
	if !ok {
		t.Fatalf("expected decorated gamma callable, got %#v", byIdentity)
	}
	if gamma.Kind != CallableKindFunction {
		t.Fatalf("expected gamma function kind, got %q", gamma.Kind)
	}

	gadget, ok := byIdentity["pkg.watch_me.Gadget:class_init"]
	if !ok {
		t.Fatalf("expected decorated class callable, got %#v", byIdentity)
	}
	if gadget.Kind != CallableKindClassInit {
		t.Fatalf("expected Gadget class_init kind, got %q", gadget.Kind)
	}
}

func TestParsePythonCallablesReturnsNotParsedOnSyntaxError(t *testing.T) {
	t.Parallel()

	// Syntax errors must short-circuit parsing so watcher updates do not mutate state heuristically.
	callables, parsed, err := ParsePythonCallables("def broken(", "pkg/broken.py")
	if err != nil {
		t.Fatalf("parse broken python callables: %v", err)
	}
	if parsed {
		t.Fatal("expected syntax error to return parsed=false")
	}
	if callables != nil {
		t.Fatalf("expected nil callables on syntax error, got %#v", callables)
	}
}

func TestParsePythonCallablesSignatureHashesTrackSignatureChanges(t *testing.T) {
	t.Parallel()

	// Signature and body hashes both need to react when the callable definition changes.
	first, parsed, err := ParsePythonCallables("def alpha(value):\n    return value\n", "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse first callable set: %v", err)
	}
	if !parsed || len(first) != 1 {
		t.Fatalf("expected parsed single callable, got parsed=%v callables=%#v", parsed, first)
	}

	second, parsed, err := ParsePythonCallables("def alpha(value, extra):\n    return value + extra\n", "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse second callable set: %v", err)
	}
	if !parsed || len(second) != 1 {
		t.Fatalf("expected parsed single callable, got parsed=%v callables=%#v", parsed, second)
	}

	if first[0].Identity != second[0].Identity {
		t.Fatalf("expected same callable identity, got %q vs %q", first[0].Identity, second[0].Identity)
	}
	if first[0].SignatureHash == second[0].SignatureHash {
		t.Fatalf("expected signature hash to change, got %q", first[0].SignatureHash)
	}
	if first[0].BodyHash == second[0].BodyHash {
		t.Fatalf("expected body hash to change, got %q", first[0].BodyHash)
	}
}

func TestParsePythonCallablesClassInitDropsSelfFromSignatureHash(t *testing.T) {
	t.Parallel()

	// Class callables should ignore the first named __init__ parameter when hashing signatures.
	first, parsed, err := ParsePythonCallables(`
class Widget:
    def __init__(self, value):
        self.value = value
`, "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse first class callable: %v", err)
	}
	if !parsed || len(first) != 1 {
		t.Fatalf("expected parsed single class callable, got parsed=%v callables=%#v", parsed, first)
	}

	second, parsed, err := ParsePythonCallables(`
class Widget:
    def __init__(cls, value):
        cls.value = value
`, "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse second class callable: %v", err)
	}
	if !parsed || len(second) != 1 {
		t.Fatalf("expected parsed single class callable, got parsed=%v callables=%#v", parsed, second)
	}

	if first[0].SignatureHash != second[0].SignatureHash {
		t.Fatalf("expected first class arg rename to be ignored, got %q vs %q", first[0].SignatureHash, second[0].SignatureHash)
	}
}

func TestParsePythonCallablesClassWithoutInitStillProducesCallable(t *testing.T) {
	t.Parallel()

	// Top-level classes are watchable even when they do not declare an __init__.
	callables, parsed, err := ParsePythonCallables(`
class Widget:
    pass
`, "pkg/watch_me.py")
	if err != nil {
		t.Fatalf("parse class without init: %v", err)
	}
	if !parsed {
		t.Fatal("expected parser success")
	}
	if len(callables) != 1 {
		t.Fatalf("expected one callable, got %#v", callables)
	}
	if callables[0].Identity != "pkg.watch_me.Widget:class_init" {
		t.Fatalf("unexpected class identity %q", callables[0].Identity)
	}
}

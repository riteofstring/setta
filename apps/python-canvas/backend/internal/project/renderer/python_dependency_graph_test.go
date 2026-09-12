package renderer

import (
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

func TestRenderOrdersForwardStateReferenceBeforeConsumer(t *testing.T) {
	t.Parallel()

	result, err := Render(dependencyOrderingState())
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	producerValue := "state.Producer__value = 21"
	producer := "state.Producer = make_value(value=state.Producer__value)"
	consumerValue := "state.Consumer__value = state.Producer"
	consumer := "state.Consumer = consume(value=state.Consumer__value)"
	for _, expected := range []string{producerValue, producer, consumerValue, consumer} {
		if !strings.Contains(result.Body, expected) {
			t.Fatalf("rendered body does not contain %q:\n%s", expected, result.Body)
		}
	}
	assertRenderedBefore(t, result.Body, producerValue, producer)
	assertRenderedBefore(t, result.Body, producer, consumerValue)
	assertRenderedBefore(t, result.Body, consumerValue, consumer)

	producerRange := result.SourceRangesByTargetID["callable-producer"]
	consumerRange := result.SourceRangesByTargetID["callable-consumer"]
	if producerRange.Start >= consumerRange.Start {
		t.Fatalf("producer range %#v must precede consumer range %#v", producerRange, consumerRange)
	}
	if got := result.Code[producerRange.Start:producerRange.End]; got != "make_value" {
		t.Fatalf("producer source range = %q", got)
	}
	if got := result.Code[consumerRange.Start:consumerRange.End]; got != "consume" {
		t.Fatalf("consumer source range = %q", got)
	}
	if got := result.TargetPathsByID["callable-producer"]; got != "Producer" {
		t.Fatalf("producer target path = %q, want Producer", got)
	}
}

func TestRenderResolvesNestedGeneratedParameterAndKeepsUnrelatedOrder(t *testing.T) {
	t.Parallel()

	state := dependencyOrderingState()
	state.Callables[0].Parameters[0].AuthoredExpression = "state.Producer__value"
	state.Callables = append(state.Callables, aggregate.Callable{
		ID: "callable-unrelated", Name: "Unrelated", AuthoredExpression: "unrelated", Parameters: []aggregate.Parameter{},
	})
	state.TopLevelSectionIDs = []string{"callable-consumer", "callable-unrelated", "callable-producer"}

	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	producerValue := "state.Producer__value = 21"
	consumerValue := "state.Consumer__value = state.Producer__value"
	producer := "state.Producer = make_value(value=state.Producer__value)"
	consumer := "state.Consumer = consume(value=state.Consumer__value)"
	unrelated := "state.Unrelated = unrelated()"
	assertRenderedBefore(t, result.Body, producerValue, consumerValue)
	assertRenderedBefore(t, result.Body, consumerValue, consumer)
	assertRenderedBefore(t, result.Body, consumer, unrelated)
	assertRenderedBefore(t, result.Body, unrelated, producer)
}

func TestRenderLeavesUnknownStateReferenceForProviderDiagnostics(t *testing.T) {
	t.Parallel()

	state := dependencyOrderingState()
	state.Callables[0].Parameters[0].AuthoredExpression = "state.Unknown"
	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	consumerValue := "state.Consumer__value = state.Unknown"
	producerValue := "state.Producer__value = 21"
	assertRenderedBefore(t, result.Body, consumerValue, producerValue)
	if len(result.DependencyCycleTargetIDs) != 0 {
		t.Fatalf("unknown reference produced cycles: %#v", result.DependencyCycleTargetIDs)
	}
}

func TestRenderOrdersDictionaryLeafReferenceBeforeItsComposition(t *testing.T) {
	t.Parallel()

	state := dependencyOrderingState()
	state.Callables = state.Callables[1:]
	state.ParameterDictionaries = []aggregate.ParameterDictionary{{
		ID: "dictionary-consumer", Name: "Consumer options", Entries: []aggregate.DictionaryEntry{{
			ID: "entry-consumer-value", Name: "value", Leaf: &aggregate.DictionaryLeaf{AuthoredExpression: "state.Producer"},
		}}},
	}
	state.TopLevelSectionIDs = []string{"dictionary-consumer", "callable-producer"}

	result, err := Render(state)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	producer := "state.Producer = make_value(value=state.Producer__value)"
	leaf := "state.Consumer_options__value = state.Producer"
	dictionary := "state.Consumer_options = {\"value\": state.Consumer_options__value}"
	assertRenderedBefore(t, result.Body, producer, leaf)
	assertRenderedBefore(t, result.Body, leaf, dictionary)
}

func TestRenderDeduplicatesResolvedDependencyAndPublishesCycleTargets(t *testing.T) {
	t.Parallel()

	t.Run("deduplicates", func(t *testing.T) {
		state := dependencyOrderingState()
		state.Callables[0].Parameters[0].AuthoredExpression = "state.Producer + state.Producer"
		result, err := Render(state)
		if err != nil {
			t.Fatalf("Render() error = %v", err)
		}
		if got := strings.Count(result.Body, "state.Producer = make_value("); got != 1 {
			t.Fatalf("producer assignment count = %d:\n%s", got, result.Body)
		}
	})

	t.Run("cycle", func(t *testing.T) {
		state := aggregate.State{
			Project:      aggregate.Project{ID: "project-cycle", Name: "Cycle", Revision: 1},
			PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
			Callables: []aggregate.Callable{
				{ID: "callable-a", Name: "A", AuthoredExpression: "state.B", Parameters: []aggregate.Parameter{}},
				{ID: "callable-b", Name: "B", AuthoredExpression: "state.A", Parameters: []aggregate.Parameter{}},
			},
			TopLevelSectionIDs: []string{"callable-a", "callable-b"},
		}
		first, err := Render(state)
		if err != nil {
			t.Fatalf("Render() error = %v", err)
		}
		second, err := Render(state)
		if err != nil {
			t.Fatalf("second Render() error = %v", err)
		}
		if first.Code != second.Code || strings.Join(first.DependencyCycleTargetIDs, ",") != strings.Join(second.DependencyCycleTargetIDs, ",") {
			t.Fatalf("cycle rendering is not deterministic: %#v / %#v", first, second)
		}
		want := []string{"callable-a", "callable-b"}
		if strings.Join(first.DependencyCycleTargetIDs, ",") != strings.Join(want, ",") {
			t.Fatalf("cycle targets = %#v, want %#v", first.DependencyCycleTargetIDs, want)
		}
		assertRenderedBefore(t, first.Body, "state.B = state.A()", "state.A = state.B()")
	})
}

func dependencyOrderingState() aggregate.State {
	return aggregate.State{
		Project:      aggregate.Project{ID: "project-ordering", Name: "Ordering", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{
				ID: "callable-consumer", Name: "Consumer", AuthoredExpression: "consume",
				Parameters: []aggregate.Parameter{{
					ID:                 "parameter-consumer-value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
					AuthoredExpression: "state.Producer",
				}},
			},
			{
				ID: "callable-producer", Name: "Producer", AuthoredExpression: "make_value",
				Parameters: []aggregate.Parameter{{
					ID:                 "parameter-producer-value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
					AuthoredExpression: "21",
				}},
			},
		},
		TopLevelSectionIDs: []string{"callable-consumer", "callable-producer"},
	}
}

func assertRenderedBefore(t *testing.T, body string, first string, second string) {
	t.Helper()
	firstIndex := strings.Index(body, first)
	secondIndex := strings.Index(body, second)
	if firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex {
		t.Fatalf("want %q before %q:\n%s", first, second, body)
	}
}

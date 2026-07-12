package conversation

func contractValueSet[T ~string](name string, values ...T) ContractValueSet {
	return ContractValueSet{Name: name, Values: stringValues(values)}
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

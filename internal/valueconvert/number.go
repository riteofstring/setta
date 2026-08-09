package valueconvert

import "reflect"

func Float64(value any) (float64, bool) {
	raw := reflect.ValueOf(value)
	if !raw.IsValid() {
		return 0, false
	}

	switch raw.Kind() {
	case reflect.Float32, reflect.Float64:
		return raw.Convert(reflect.TypeOf(float64(0))).Float(), true
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return float64(raw.Int()), true
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return float64(raw.Uint()), true
	default:
		return 0, false
	}
}

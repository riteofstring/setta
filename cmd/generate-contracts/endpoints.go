package main

import (
	"bytes"
	"fmt"
)

func renderEndpointDescriptors(buffer *bytes.Buffer, endpoints []endpointSpec) {
	buffer.WriteString("export const backendEndpoints = {\n")
	for _, endpoint := range endpoints {
		fmt.Fprintf(buffer, "  %s: {\n", endpoint.Name)
		fmt.Fprintf(buffer, "    method: %q,\n", endpoint.Method)
		fmt.Fprintf(buffer, "    path: %q,\n", endpoint.Path)
		if endpoint.RequestBodyLimitBytes > 0 {
			fmt.Fprintf(buffer, "    requestBodyLimitBytes: %d,\n", endpoint.RequestBodyLimitBytes)
		}
		buffer.WriteString("  },\n")
	}
	buffer.WriteString("} as const;\n\n")
}

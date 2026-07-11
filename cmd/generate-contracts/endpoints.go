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
		if endpoint.Duplex {
			buffer.WriteString("    duplex: true,\n")
		}
		buffer.WriteString("  },\n")
	}
	buffer.WriteString("} as const;\n\n")
	renderDuplexProtocolDescriptors(buffer, endpoints)
}

func renderDuplexProtocolDescriptors(buffer *bytes.Buffer, endpoints []endpointSpec) {
	buffer.WriteString("export const backendDuplexProtocols = {\n")
	for _, endpoint := range endpoints {
		if !endpoint.Duplex {
			continue
		}
		fmt.Fprintf(buffer, "  %s: {\n", endpoint.Name)
		fmt.Fprintf(buffer, "    endpoint: backendEndpoints.%s,\n", endpoint.Name)
		fmt.Fprintf(buffer, "    decodeClientMessage: %s,\n", decoderFunctionName(endpoint.DuplexClientMessage))
		fmt.Fprintf(buffer, "    decodeServerMessage: %s,\n", decoderFunctionName(endpoint.DuplexServerMessage))
		buffer.WriteString("  },\n")
	}
	buffer.WriteString("} as const;\n\n")
}

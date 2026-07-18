export function chatTextInput(text) {
  return {
    parts: [
      {
        image: null,
        text: { format: "plain", text },
        type: "text",
      },
    ],
  };
}

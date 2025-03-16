# Setta Frontend

This is the frontend for the Setta project.

## AI Integration

The application uses the Vercel AI SDK for LLM integration. The implementation is in `src/services/vercelAIService.js`.

### Key Features

- **Model Service ID Detection**: Automatically detects the service provider (OpenAI, Anthropic, etc.) from the model name.
- **API Key Management**: Retrieves API keys from localStorage based on the service provider.
- **Streaming Responses**: Handles streaming responses from the backend API.
- **Error Handling**: Comprehensive error handling for API errors, missing API keys, etc.
- **Model Selection**: Provides a list of available models filtered by available API keys.

### Available Models

The service includes support for the latest models:

- **Anthropic**:

  - Claude 3 Opus (claude-3-opus-20240229)
  - Claude 3 Sonnet (claude-3-sonnet-20240229)
  - Claude 3 Haiku (claude-3-haiku-20240307)
  - Claude 3.5 Sonnet (claude-3-5-sonnet-20240620)

- **OpenAI**:
  - GPT-4 (gpt-4)
  - GPT-4 Turbo (gpt-4-turbo)
  - GPT-3.5 Turbo (gpt-3.5-turbo)

### Usage

To use the AI service in a component:

```jsx
import { sendMessageWithVercel } from "services/vercelAIService";

// In your component
const handleSendMessage = async () => {
  await sendMessageWithVercel({
    message: "Your message here",
    model: "claude-3-sonnet-20240229",
    onStart: () => {
      // Handle start of streaming
    },
    onMessage: (content) => {
      // Handle each message chunk
    },
    onError: (error) => {
      // Handle errors
    },
    onFinish: () => {
      // Handle completion
    },
  });
};
```

## Development

### Installation

```bash
pnpm install
```

### Running the Application

```bash
pnpm start
```

This will start both the frontend and backend servers.

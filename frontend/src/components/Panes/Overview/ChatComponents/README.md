# Project LLM Chat

This directory contains components for the Project LLM Chat feature, which provides an AI assistant for the Setta application. The chat functionality is designed to help users with project layout, configurations, and code generation.

## Components

- **CodeBlockDisplay**: A component for displaying code blocks with syntax highlighting, copy-to-clipboard functionality, and collapsible views.
- Additional components may be added as the feature evolves.

## Integration with Vercel AI SDK

The chat functionality is designed to integrate with Vercel's AI SDK and FastAPI backend. This integration is currently a placeholder and will be implemented in the future.

### Current Implementation

- Basic UI for chat messages
- Simulated streaming response
- Code block rendering
- Model selection

### Future Implementation

- Integration with Vercel AI SDK
- Streaming responses from FastAPI backend
- File upload and attachment capabilities
- Advanced context-aware interactions with the project

## Usage

The main component `ProjectLLMChat` is rendered in the Overview pane when the LLM Chat tab is selected. It provides:

1. A text input area for user messages
2. A display area for the conversation history
3. Options to select different LLM models
4. Functionality to clear the conversation
5. Support for code snippets and markdown formatting

## Styling

The components follow the project's styling conventions:

- Using the custom 'setta' color palette for light and dark modes
- Consistent with the existing UI patterns
- Responsive design that fits within the pane layout

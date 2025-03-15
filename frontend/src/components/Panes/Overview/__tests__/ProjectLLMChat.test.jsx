import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as aiService from "../../../../services/aiService";
import { ProjectLLMChat } from "../ProjectLLMChat";

// Import the useIsScrollable function to enable direct mocking
vi.mock("state/hooks/sectionSizes", () => ({
  useIsScrollable: vi.fn().mockReturnValue({
    ref: { current: null },
    isScrollable: false,
  }),
}));

// Mock the URL.createObjectURL function
global.URL.createObjectURL = vi.fn(() => "mock-object-url");
global.URL.revokeObjectURL = vi.fn();

// Mock the scrollIntoView method that's missing in jsdom
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = vi.fn();
}

// Create a mock implementation for mockStreamResponse
const mockStreamResponseFn = vi.fn();

// Mock the service with our mockStreamResponseFn
vi.mock("services/projectLLMService", () => ({
  mockStreamResponse: (...args) => mockStreamResponseFn(...args),
}));

// Mock React Markdown to simplify rendering
vi.mock("react-markdown", () => ({
  default: ({ children }) => (
    <div data-testid="markdown-content">{children}</div>
  ),
}));

// Mock the CodeBlockDisplay component
vi.mock("../ChatComponents/CodeBlockDisplay", () => ({
  CodeBlockDisplay: ({ children }) => (
    <pre data-testid="code-block">{children}</pre>
  ),
}));

// Mock the ReasoningAccordion component
vi.mock("../ChatComponents/ReasoningAccordion", () => ({
  ReasoningAccordion: ({ reasoning }) => (
    <div data-testid="reasoning-accordion">{reasoning}</div>
  ),
}));

// Mock the FileDragDrop component
vi.mock("../ChatComponents/FileDragDrop", () => ({
  FileDragDrop: ({ onFileSelect }) => (
    <div data-testid="file-drag-drop">
      <button
        data-testid="select-file-button"
        onClick={() => {
          // Mock file object
          const mockFile = new File(["file content"], "test-file.png", {
            type: "image/png",
          });
          onFileSelect([mockFile]);
        }}
      >
        Select File
      </button>
    </div>
  ),
}));

// Mock the aiService
vi.mock("../../../../services/aiService", () => ({
  sendMessage: vi.fn(),
  getAvailableModels: vi.fn().mockResolvedValue([
    { id: "gpt-4", name: "GPT-4" },
    { id: "claude-3", name: "Claude 3" },
    { id: "mixtral", name: "Mixtral" },
    { id: "llama-3", name: "Llama 3" },
  ]),
  formatModelOption: vi.fn((model) => ({
    value: model.id,
    label: model.name,
  })),
}));

// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockStreamResponseFn.mockClear();

  // Reset any document scroll position if it exists
  if (typeof document !== "undefined") {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  }
});

describe("ProjectLLMChat Tests", () => {
  beforeEach(() => {
    // Default mock implementation that properly simulates streaming
    mockStreamResponseFn.mockImplementation((message, callback, onComplete) => {
      // Default implementation for general tests
      // Simulate streaming in multiple chunks to test streaming behavior
      setTimeout(() => {
        callback("This ");
        setTimeout(() => {
          callback("is ");
          setTimeout(() => {
            callback("a ");
            setTimeout(() => {
              callback("test ");
              setTimeout(() => {
                callback("response");
                setTimeout(() => {
                  onComplete("Sample reasoning data"); // Pass reasoning data
                }, 50);
              }, 50);
            }, 50);
          }, 50);
        }, 50);
      }, 50);

      return () => {}; // Return cleanup function
    });
  });

  it("renders the component", () => {
    render(<ProjectLLMChat />);
    expect(screen.getByTestId("project-llm-chat")).toBeDefined();
  });

  it("displays placeholder when no messages exist", () => {
    render(<ProjectLLMChat />);
    expect(
      screen.getByText(/Ask me anything about this project/i),
    ).toBeDefined();
  });

  it("sends a message and receives a response", async () => {
    // Use consistent mocking with aiService.sendMessage
    const responseContent = "This is a test response";
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(({ onMessage, onComplete }) => {
      onMessageCallback = onMessage;
      onCompleteCallback = onComplete;
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Type a message
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, { target: { value: "Test message" } });

    // Submit the message
    const submitButton = screen.getByTestId("send-button");
    fireEvent.click(submitButton);

    // Check the user message appears
    await waitFor(() => {
      expect(screen.getByText("Test message")).toBeDefined();
    });

    // Check that input is cleared after sending
    expect(inputElement.value).toBe("");

    // Check for thinking indicator
    expect(screen.getByTestId("thinking-indicator")).toBeDefined();

    // Simulate the response
    onMessageCallback(responseContent);

    // Wait for the response to appear in the thinking indicator
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain(responseContent);
    });

    // Complete the message
    onCompleteCallback("Sample reasoning data");

    // Check for the final message
    await waitFor(() => {
      expect(screen.getByText(responseContent)).toBeDefined();
    });

    // Check that reasoning data is displayed
    await waitFor(() => {
      const reasoningElement = screen.getByTestId("reasoning-accordion");
      expect(reasoningElement).toBeDefined();
      expect(reasoningElement.textContent).toBe("Sample reasoning data");
    });
  });

  it("handles streaming responses correctly", async () => {
    // Create a specific streamed content for this test
    const testContent = "This is a test streamed message";
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(({ onMessage, onComplete }) => {
      onMessageCallback = onMessage;
      onCompleteCallback = onComplete;
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Send a test message
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, { target: { value: "Test streaming" } });
    fireEvent.click(screen.getByTestId("send-button"));

    // Initially, we should see the user message and a thinking indicator
    expect(screen.getByText("Test streaming")).toBeDefined();
    expect(screen.getByTestId("thinking-indicator")).toBeDefined();

    // Simulate streaming in parts
    onMessageCallback("This ");

    // Wait for partial content to appear during streaming
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain("This ");
    });

    // Continue streaming
    onMessageCallback("is a ");
    onMessageCallback("test ");
    onMessageCallback("streamed ");
    onMessageCallback("message");

    // Wait for more content to appear
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain(testContent);
    });

    // Complete the message
    onCompleteCallback("Test reasoning data");

    // Wait for the final response to be complete
    await waitFor(() => {
      expect(screen.getByText(testContent)).toBeDefined();
    });
  });

  it("maintains input focus after sending a message", async () => {
    render(<ProjectLLMChat />);

    // Type a message
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, { target: { value: "Test focus" } });

    // Focus the input
    inputElement.focus();
    expect(document.activeElement).toBe(inputElement);

    // Submit the message
    fireEvent.click(screen.getByTestId("send-button"));

    // Wait for the response
    await waitFor(
      () => {
        expect(
          screen.getByText("This is a test streamed message"),
        ).toBeDefined();
      },
      { timeout: 2000 },
    );

    // Check that the input is focused again after response
    expect(document.activeElement.tagName.toLowerCase()).toBe("textarea");
  });

  it("maintains proper chat layout with fixed input at bottom", () => {
    render(<ProjectLLMChat />);

    // Get the main container and check its layout
    const chatContainer = screen.getByTestId("project-llm-chat");
    expect(chatContainer).toBeDefined();

    // Check that the container has flex layout with overflow hidden
    expect(chatContainer.className).toContain("flex");
    expect(chatContainer.className).toContain("flex-col");
    expect(chatContainer.className).toContain("overflow-hidden");

    // Check that the messages container has flex-1 to take available space
    const messagesContainer = chatContainer.querySelector(".flex-1");
    expect(messagesContainer).toBeDefined();
    expect(messagesContainer.className).toContain("flex-col-reverse");
    expect(messagesContainer.className).toContain("overflow-y-auto");

    // Check that the input area is positioned at the bottom with a border
    const inputArea = chatContainer.querySelector(".border-t");
    expect(inputArea).toBeDefined();
    expect(inputArea.className).toContain("border-t");

    // The layout should ensure the input stays at the bottom
    expect(chatContainer.lastElementChild).toBe(inputArea);

    // Check that the send button doesn't have a bottom margin
    // that would push it off the page
    const sendButton = screen.getByTestId("send-button");
    expect(sendButton.className).toContain("mb-0");
    expect(sendButton.className).not.toContain("mb-1");
  });

  it("handles image attachments correctly", async () => {
    // Create a mock file
    const mockFile = new File(["test image content"], "test-image.png", {
      type: "image/png",
    });

    // Render the component
    render(<ProjectLLMChat />);

    // Click the image upload button
    const uploadButton = screen.getByTitle("Attach image");
    fireEvent.click(uploadButton);

    // Verify the FileDragDrop component appears
    await waitFor(() => {
      expect(screen.getByTestId("file-drag-drop")).toBeDefined();
    });

    // Click the select file button in our mock component
    const selectFileButton = screen.getByTestId("select-file-button");
    fireEvent.click(selectFileButton);

    // Type and send a message with the attached file
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, { target: { value: "Message with image" } });
    fireEvent.click(screen.getByTestId("send-button"));

    // Wait for the message to be processed
    await waitFor(
      () => {
        expect(screen.getByText("Message with image")).toBeDefined();
      },
      { timeout: 2000 },
    );

    // Verify FileDragDrop is gone after sending
    await waitFor(() => {
      expect(screen.queryByTestId("file-drag-drop")).toBeNull();
    });

    // Wait for the assistant's response
    await waitFor(
      () => {
        expect(
          screen.getByText("This is a test streamed message"),
        ).toBeDefined();
      },
      { timeout: 2000 },
    );
  });

  it("ensures messages are properly displayed and not empty", async () => {
    // Use a more consistent mocking approach
    const firstResponse = "First part of the message";
    const secondResponse = "Second part of the message";
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(({ onMessage, onComplete }) => {
      onMessageCallback = onMessage;
      onCompleteCallback = onComplete;
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Send first message
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, { target: { value: "First test message" } });
    fireEvent.click(screen.getByTestId("send-button"));

    // Simulate first response
    onMessageCallback(firstResponse);

    // Wait for the content to appear in the streaming indicator
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain(firstResponse);
    });

    // Complete the first message
    onCompleteCallback("Test reasoning for first message");

    // Verify that the first response was added through more flexible matching
    await waitFor(() => {
      // Find the reasoning accordion
      const reasoningElements = screen.getAllByTestId("reasoning-accordion");
      expect(reasoningElements.length).toBe(1);
      expect(reasoningElements[0].textContent).toBe(
        "Test reasoning for first message",
      );

      // Find the markdown content
      const markdownElements = screen.getAllByTestId("markdown-content");
      // At least 2 elements - one for user message, one for response
      expect(markdownElements.length).toBeGreaterThan(1);
    });

    // Send second message
    fireEvent.change(inputElement, {
      target: { value: "Second test message" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    // Simulate second response
    onMessageCallback(secondResponse);

    // Wait for the content to appear in the streaming indicator
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain(secondResponse);
    });

    // Complete the second message
    onCompleteCallback("Test reasoning for second message");

    // Verify both user messages appear using more flexible matching
    await waitFor(() => {
      const userMessages = screen.getAllByText(/test message/);
      expect(userMessages.length).toBe(2);
    });

    // Verify both responses have reasoning accordions
    await waitFor(() => {
      const reasoningElements = screen.getAllByTestId("reasoning-accordion");
      expect(reasoningElements.length).toBe(2);
      expect(reasoningElements[0].textContent).toBe(
        "Test reasoning for first message",
      );
      expect(reasoningElements[1].textContent).toBe(
        "Test reasoning for second message",
      );
    });
  });

  it("prevents messages from disappearing during streaming", async () => {
    // Set up a more consistent mock implementation for aiService.sendMessage
    const streamedContent =
      "First part of the message, which should not disappear during streaming or completion.";
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(({ onMessage, onComplete }) => {
      onMessageCallback = onMessage;
      onCompleteCallback = onComplete;
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Send a test message
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, { target: { value: "Test persistence" } });
    fireEvent.click(screen.getByTestId("send-button"));

    // Check that the user message appears immediately
    expect(screen.getByText("Test persistence")).toBeDefined();

    // Simulate streaming in chunks
    onMessageCallback("First part ");

    // Wait for streaming to start
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain("First part ");
    });

    // Send more content
    onMessageCallback("of the message, ");

    // Wait for more content to appear
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain(
        "First part of the message",
      );
    });

    // Continue streaming
    onMessageCallback("which should not ");
    onMessageCallback("disappear during ");
    onMessageCallback("streaming or completion.");

    // Check full message content
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain(streamedContent);
    });

    // Continue to check the user message is still there during streaming
    expect(screen.getByText("Test persistence")).toBeDefined();

    // Complete the message
    onCompleteCallback("Test reasoning data");

    // Ensure the final message is displayed
    await waitFor(() => {
      expect(screen.getByText(streamedContent)).toBeDefined();
    });

    // Ensure user message is still present after completion
    expect(screen.getByText("Test persistence")).toBeDefined();
  });

  it("handles code blocks properly without horizontal scrollbars", async () => {
    // Use consistent mocking with aiService.sendMessage
    const codeContent = "Here is a code example:";
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(({ onMessage, onComplete }) => {
      onMessageCallback = onMessage;
      onCompleteCallback = onComplete;
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Send a message asking for code
    const inputElement = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(inputElement, {
      target: { value: "Show me some code with long lines" },
    });
    fireEvent.click(screen.getByTestId("send-button"));

    // Simulate the streaming response
    onMessageCallback(codeContent);

    // Wait for the streaming response to appear
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain("Here is a code example");
    });

    // Complete the message
    onCompleteCallback("Test reasoning for code example");

    // Verify the container has proper overflow handling
    const chatContainer = screen.getByTestId("project-llm-chat");
    const messagesContainer = chatContainer.querySelector(".overflow-x-hidden");
    expect(messagesContainer).toBeDefined();

    // Use a more flexible approach to verify message content
    await waitFor(() => {
      // Find all divs with markdown-content attribute
      const markdownElements = screen.getAllByTestId("markdown-content");

      // The second element should be the assistant's response
      const assistantResponse =
        markdownElements[markdownElements.length > 1 ? 1 : 0];
      expect(assistantResponse).toBeDefined();

      // Verify the reasoning accordion is displayed
      const reasoningElement = screen.getByTestId("reasoning-accordion");
      expect(reasoningElement).toBeDefined();
      expect(reasoningElement.textContent).toBe(
        "Test reasoning for code example",
      );
    });
  });

  it("renders the chat component with proper title", () => {
    render(<ProjectLLMChat />);
    expect(screen.getByText("Project Assistant")).toBeInTheDocument();
  });

  it("allows user to type and send a message", async () => {
    // Arrange: set up the mock implementation
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(
      ({ message, onMessage, onComplete }) => {
        onMessageCallback = onMessage;
        onCompleteCallback = onComplete;
        return Promise.resolve();
      },
    );

    // Act: render the component and interact with it
    render(<ProjectLLMChat />);

    // Type a message
    const inputField = screen.getByPlaceholderText("Type a message...");
    await userEvent.type(inputField, "Hello, assistant!");

    // Send the message
    const sendButton = screen.getByTestId("send-button");
    await userEvent.click(sendButton);

    // Assert: verify the UI updated appropriately
    expect(screen.getByText("Hello, assistant!")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();

    // Verify the service was called with the correct parameters
    expect(aiService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Hello, assistant!",
        model: "gpt-4", // Default model
      }),
    );

    // Simulate the assistant's response
    onMessageCallback("Hello! How can I help you today?");

    // Wait for the response to appear
    await waitFor(() => {
      expect(
        screen.getByText("Hello! How can I help you today?"),
      ).toBeInTheDocument();
    });

    // Simulate completion with reasoning
    onCompleteCallback("This is the reasoning for the response");

    // Verify the thinking indicator is gone
    await waitFor(() => {
      expect(
        screen.queryByTestId("thinking-indicator"),
      ).not.toBeInTheDocument();
    });
  });

  it("displays a model selector that works correctly", async () => {
    // Mock the sendMessage function
    aiService.sendMessage.mockImplementation(() => {
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Check the default model is displayed
    const modelSelector = screen.getByTestId("model-selector");
    expect(modelSelector.textContent).toContain("GPT-4");

    // Open the model selector
    await userEvent.click(modelSelector);

    // Choose a different model
    const claudeOption = screen.getByText("Claude 3");
    await userEvent.click(claudeOption);

    // Verify the selected model is now displayed
    expect(modelSelector.textContent).toContain("Claude 3");

    // Type and send a message
    const inputField = screen.getByPlaceholderText("Type a message...");
    await userEvent.type(inputField, "Test message with Claude");

    const sendButton = screen.getByTestId("send-button");
    await userEvent.click(sendButton);

    // Verify the service was called with the correct model
    expect(aiService.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Test message with Claude",
        model: "claude-3",
      }),
    );
  });

  it("allows clearing the conversation", async () => {
    // Setup a conversation first
    let onMessageCallback;
    let onCompleteCallback;

    aiService.sendMessage.mockImplementation(({ onMessage, onComplete }) => {
      onMessageCallback = onMessage;
      onCompleteCallback = onComplete;
      return Promise.resolve(new AbortController());
    });

    render(<ProjectLLMChat />);

    // Verify the empty state is displayed
    expect(
      screen.getByText(/Ask me anything about this project/i),
    ).toBeInTheDocument();

    // Send a message
    const inputField = screen.getByPlaceholderText("Type a message...");
    await userEvent.type(inputField, "Hello");

    const sendButton = screen.getByTestId("send-button");
    await userEvent.click(sendButton);

    // Check user message appears
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    // Simulate the assistant's response
    onMessageCallback("Hi there");

    // Wait for the message to appear in the streaming indicator
    await waitFor(() => {
      const thinkingIndicator = screen.getByTestId("thinking-indicator");
      expect(thinkingIndicator.textContent).toContain("Hi there");
    });

    // Complete the message
    onCompleteCallback("Test reasoning");

    // Verify final message is displayed
    await waitFor(() => {
      expect(screen.getByText("Hi there")).toBeInTheDocument();
    });

    // Verify empty state is gone
    expect(
      screen.queryByText(/Ask me anything about this project/i),
    ).not.toBeInTheDocument();

    // Now clear the conversation
    const clearButton = screen.getByTitle("Clear conversation");
    await userEvent.click(clearButton);

    // Verify the messages are gone
    await waitFor(() => {
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
      expect(screen.queryByText("Hi there")).not.toBeInTheDocument();
    });

    // Verify the empty state is displayed again
    await waitFor(() => {
      expect(
        screen.getByText(/Ask me anything about this project/i),
      ).toBeInTheDocument();
    });
  });
});

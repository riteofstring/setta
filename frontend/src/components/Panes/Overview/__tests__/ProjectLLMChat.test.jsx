import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectLLMChat } from "../ProjectLLMChat";

// Mock the dependencies
vi.mock("state/hooks/sectionSizes", () => ({
  useIsScrollable: () => ({
    ref: { current: null },
    isScrollable: false,
  }),
}));

vi.mock("services/projectLLMService", () => ({
  mockStreamResponse: vi.fn((message, callback, onComplete) => {
    // Simple mock implementation
    return () => {};
  }),
}));

// Mock React Markdown to simplify rendering
vi.mock("react-markdown", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

// Mock the CodeBlockDisplay component
vi.mock("../ChatComponents/CodeBlockDisplay", () => ({
  CodeBlockDisplay: ({ children }) => <pre>{children}</pre>,
}));

describe("ProjectLLMChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the component", () => {
    render(<ProjectLLMChat />);
    expect(screen.getByTestId("project-llm-chat")).toBeDefined();
  });

  it("shows placeholder message when no messages exist", () => {
    render(<ProjectLLMChat />);
    expect(
      screen.getByText(/Ask me anything about this project/i),
    ).toBeDefined();
  });
});

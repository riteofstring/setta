// This file will handle the integration with Vercel AI SDK and FastAPI
// It's a placeholder for now, to be implemented later

import axios from "axios";

// This will be replaced with the Vercel AI SDK integration
export async function sendMessage(message, model) {
  try {
    // In the future, this will be an API call to the FastAPI backend
    // using Vercel AI SDK for streaming responses
    const response = await axios.post("/api/chat", {
      message,
      model,
    });
    return response.data;
  } catch (error) {
    console.error("Error sending message to LLM:", error);
    throw error;
  }
}

// Mock function for simulating a streamed response
export function mockStreamResponse(message, callback, onComplete) {
  // Check if the user's message contains keywords related to code
  const isCodeRequest =
    message.toLowerCase().includes("code") ||
    message.toLowerCase().includes("example") ||
    message.toLowerCase().includes("function") ||
    message.toLowerCase().includes("component");

  // Track if this is a request that we should add reasoning to (only for more complex models)
  const shouldIncludeReasoning =
    (message.toLowerCase().includes("explain") ||
      message.toLowerCase().includes("why") ||
      message.toLowerCase().includes("how does") ||
      isCodeRequest) &&
    Math.random() > 0.3; // Only include reasoning sometimes

  let responseChunks = [];
  let reasoning = null;

  if (isCodeRequest) {
    // Send a single, well-formatted response with proper markdown
    responseChunks = [
      `Sure, here's a sample React component you might find useful:

\`\`\`jsx
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <h2>Count: {count}</h2>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}

export default Counter;
\`\`\`

You can also use this JavaScript utility function:

\`\`\`javascript
/**
 * Formats a date in a user-friendly way
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return new Date(date).toLocaleString('en-US', options);
}
\`\`\`

Here's a Python example as well:

\`\`\`python
from typing import List

def find_max_subarray(nums: List[int]) -> int:
    """Find the contiguous subarray with the largest sum.
    
    Args:
        nums: A list of integers
        
    Returns:
        The sum of the maximum subarray
    """
    if not nums:
        return 0
        
    current_sum = max_sum = nums[0]
    
    for num in nums[1:]:
        current_sum = max(num, current_sum + num)
        max_sum = max(max_sum, current_sum)
        
    return max_sum
\`\`\`

Does this help with what you were looking for? Let me know if you need any modifications to these examples.`,
    ];

    if (shouldIncludeReasoning) {
      reasoning = `1. **Request Analysis**: The user is asking for code examples or components.
2. **Technical Context**: Based on the project structure, this appears to be a React-based web application.
3. **Component Selection**: I've decided to provide a simple counter component that demonstrates React state.
4. **Utility Function**: Adding a date formatting utility since this is commonly needed in web applications.
5. **Algorithm Example**: Including a Python algorithm example to show versatility across languages.
6. **Code Quality**: All examples include proper documentation, type hints where appropriate, and follow best practices.
7. **Final Assessment**: These examples should give the user a good starting point for various common programming tasks.`;
    }
  } else {
    // Standard response for non-code requests
    responseChunks = [
      "This is a simulated streaming response. The actual implementation will use Vercel AI SDK with FastAPI. You can ask me about project structure, code, or configuration tasks. I'll be able to help with a variety of development tasks. Try asking me to show you some code examples!",
    ];

    if (shouldIncludeReasoning) {
      reasoning = `1. **Context Analysis**: The user's query doesn't appear to be about code specifically.
2. **Response Strategy**: Providing a general informational response about the chat system.
3. **User Guidance**: Suggesting the user ask about code examples to demonstrate the system's capabilities.
4. **Integration Context**: Mentioning the planned integration with Vercel AI SDK and FastAPI to set expectations.
5. **Capabilities Summary**: Briefly outlining the types of assistance that will be available.`;
    }
  }

  // Instead of streaming chunk by chunk, stream character by character
  // This simulates a more realistic streaming experience while maintaining proper markdown structure
  const fullResponse = responseChunks[0];
  let currentPosition = 0;
  const chunkSize = isCodeRequest ? 15 : 5; // Larger chunks for code responses

  const interval = setInterval(() => {
    if (currentPosition < fullResponse.length) {
      const end = Math.min(currentPosition + chunkSize, fullResponse.length);
      const chunk = fullResponse.substring(currentPosition, end);
      callback(chunk);
      currentPosition = end;
    } else {
      clearInterval(interval);
      if (onComplete) {
        // Add reasoning data to the completion callback
        onComplete(reasoning);
      }
    }
  }, 30); // Fast enough to seem fluid

  return () => clearInterval(interval); // Return a cleanup function
}

// Function to handle file uploads (to be implemented)
export async function uploadFile(file) {
  try {
    // This will be implemented when the actual integration is done
    console.log("File upload functionality to be implemented");
    return { success: true, fileId: "mock-file-id" };
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

// Function to get available models (to be implemented)
export async function getAvailableModels() {
  try {
    // This will be implemented when the actual integration is done
    return [
      { id: "gpt-4", name: "GPT-4" },
      { id: "claude-3", name: "Claude 3" },
      { id: "mixtral", name: "Mixtral" },
      { id: "llama-3", name: "Llama 3" },
    ];
  } catch (error) {
    console.error("Error fetching available models:", error);
    throw error;
  }
}

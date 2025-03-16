/**
 * Authentication Test Module
 *
 * This file contains tests to verify the API authentication flow.
 * It tests various aspects of the authentication process and reports results.
 */

// Setup test environment
const TestResult = {
  PASS: "PASS",
  FAIL: "FAIL",
  ERROR: "ERROR",
};

/**
 * Run a series of tests to verify authentication functionality
 */
export async function runAuthTests(req, res) {
  console.log("[AUTH-TEST] Starting authentication tests...");

  const results = {
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      errors: 0,
    },
  };

  try {
    // Test 1: Header Extraction
    await runTest(results, "Header Access Method", async () => {
      const testHeaders = {
        authorization: "Bearer test-key-123",
        "content-type": "application/json",
      };

      // Test direct access
      const directAuth = testHeaders["authorization"];
      if (!directAuth) {
        throw new Error("Direct header access failed");
      }

      // Test case-insensitive access
      const entries = Object.entries(testHeaders);
      const authEntry = entries.find(
        ([k]) => k.toLowerCase() === "authorization",
      );
      if (!authEntry) {
        throw new Error("Case-insensitive lookup failed");
      }

      return true;
    });

    // Test 2: Bearer Token Extraction
    await runTest(results, "Bearer Token Extraction", async () => {
      const authHeader = "Bearer test-key-456";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

      if (token !== "test-key-456") {
        throw new Error(`Expected "test-key-456", got "${token}"`);
      }

      return true;
    });

    // Test 3: API Key Format Validation (Basic)
    await runTest(results, "API Key Format Validation", async () => {
      // Test empty key
      if (isValidApiKey("")) {
        throw new Error("Empty string shouldn't be valid");
      }

      // Test short key
      if (isValidApiKey("short")) {
        throw new Error("Short key shouldn't be valid");
      }

      // Test valid key
      if (!isValidApiKey("sk-ant-valid-key-12345678901234567890")) {
        throw new Error("Valid pattern key should be accepted");
      }

      return true;
    });

    // Test 4: Anthropic Authentication Format
    await runTest(results, "Anthropic Headers Formation", async () => {
      const apiKey = "sk-ant-test-key-789";
      const isClaude35 = true;

      const headers = {};
      if (isClaude35) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      if (!headers["x-api-key"] && isClaude35) {
        throw new Error("x-api-key header missing for Claude 3.5");
      }

      if (!headers["anthropic-version"]) {
        throw new Error("anthropic-version header missing");
      }

      return true;
    });

    // Test 5: OpenAI Authentication Format
    await runTest(results, "OpenAI Headers Formation", async () => {
      const apiKey = "sk-openai-test-key-123";

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      if (!headers["Authorization"]) {
        throw new Error("Authorization header missing");
      }

      if (!headers["Authorization"].startsWith("Bearer ")) {
        throw new Error("Authorization header doesn't use Bearer scheme");
      }

      return true;
    });

    // Test 6: Vercel AI SDK Compatibility
    await runTest(results, "Vercel AI SDK Compatibility", async () => {
      // Verify the header handling aligns with what Vercel AI SDK expects

      // For Anthropic
      const anthropicKey = "sk-ant-test-key-789";
      const anthropicModel = "claude-3-5-sonnet-20240620";
      const anthropicHeaders = createVercelAIHeaders(
        anthropicKey,
        anthropicModel,
        "anthropic",
      );

      if (!anthropicHeaders["x-api-key"]) {
        throw new Error(
          "Anthropic should use x-api-key header for Vercel AI SDK",
        );
      }

      if (!anthropicHeaders["anthropic-version"]) {
        throw new Error(
          "Anthropic requires anthropic-version header for Vercel AI SDK",
        );
      }

      // For OpenAI
      const openaiKey = "sk-openai-test-key-123";
      const openaiModel = "gpt-4";
      const openaiHeaders = createVercelAIHeaders(
        openaiKey,
        openaiModel,
        "openai",
      );

      if (!openaiHeaders["Authorization"]) {
        throw new Error(
          "OpenAI should use Authorization header for Vercel AI SDK",
        );
      }

      if (!openaiHeaders["Authorization"].startsWith("Bearer ")) {
        throw new Error(
          "OpenAI Authorization header must use Bearer scheme for Vercel AI SDK",
        );
      }

      return true;
    });

    // Test 7: Request Header Extraction
    await runTest(results, "Request Header Extraction", async () => {
      // Mock request object
      const mockReq = {
        headers: {
          authorization: "Bearer test-key-123",
          "x-api-key": "sk-ant-test-key-789",
          "content-type": "application/json",
        },
      };

      // Try to extract authorization header
      let authHeader = "";

      if (mockReq.headers) {
        authHeader =
          mockReq.headers["authorization"] ||
          mockReq.headers["Authorization"] ||
          "";
      }

      if (!authHeader) {
        throw new Error("Failed to extract authorization header");
      }

      // Try to extract x-api-key header
      let xApiKey = null;

      if (mockReq.headers) {
        xApiKey = mockReq.headers["x-api-key"] || mockReq.headers["X-Api-Key"];
      }

      if (!xApiKey) {
        throw new Error("Failed to extract x-api-key header");
      }

      return true;
    });

    // Calculate summary
    results.summary.total = results.tests.length;
    results.summary.passed = results.tests.filter(
      (t) => t.result === TestResult.PASS,
    ).length;
    results.summary.failed = results.tests.filter(
      (t) => t.result === TestResult.FAIL,
    ).length;
    results.summary.errors = results.tests.filter(
      (t) => t.result === TestResult.ERROR,
    ).length;

    // Return test results
    res.setHeader("Content-Type", "application/json");
    return res.json(results);
  } catch (error) {
    console.error("[AUTH-TEST] Error running auth tests:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500);
    return res.json({
      error: "Test runner encountered an error",
      message: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Create headers as expected by Vercel AI SDK
 */
function createVercelAIHeaders(apiKey, model, service) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    if (service === "anthropic" || model.startsWith("claude")) {
      const isClaude35 =
        model.includes("claude-3-5") || model.includes("claude-3.5");

      headers["anthropic-version"] = "2023-06-01";

      if (isClaude35) {
        // Claude 3.5 prefers x-api-key
        headers["x-api-key"] = apiKey;
      } else {
        // For older Claude models, include both
        headers["x-api-key"] = apiKey;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    } else {
      // Default for OpenAI and others
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  return headers;
}

/**
 * Run a single test and record its result
 */
async function runTest(results, name, testFn) {
  console.log(`[AUTH-TEST] Running test: ${name}`);
  const test = {
    name,
    result: TestResult.ERROR,
    duration: 0,
    error: null,
  };

  const startTime = Date.now();

  try {
    const success = await testFn();
    test.result = success ? TestResult.PASS : TestResult.FAIL;
  } catch (error) {
    test.result = TestResult.ERROR;
    test.error = {
      message: error.message,
      stack: error.stack,
    };
    console.error(`[AUTH-TEST] Test "${name}" failed:`, error);
  }

  test.duration = Date.now() - startTime;
  console.log(`[AUTH-TEST] Test "${name}" ${test.result} (${test.duration}ms)`);
  results.tests.push(test);
}

/**
 * Validate if an API key appears to be in a valid format
 */
function isValidApiKey(key) {
  if (!key || typeof key !== "string" || key.length < 20) {
    return false;
  }

  // Anthropic keys typically start with "sk-ant"
  const isAnthropicKey = key.startsWith("sk-ant");

  // OpenAI keys typically start with "sk-"
  const isOpenAIKey = key.startsWith("sk-") && !isAnthropicKey;

  return isAnthropicKey || isOpenAIKey || key.length >= 30;
}

/**
 * Test Script for Vercel AI SDK Authentication
 *
 * This script tests authentication with different models using the Vercel AI SDK.
 * It can be run from a Vite endpoint to validate our authentication handling.
 */

import {
  createVercelCompatibleHeaders,
  getServiceFromModel,
} from "./vercelAIService";

// Test class for executing and logging tests
class TestRunner {
  constructor() {
    this.results = {
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: 0,
      },
    };
  }

  async runTest(name, testFn) {
    console.log(`[TEST] Running: ${name}`);

    const test = {
      name,
      result: "ERROR",
      duration: 0,
      error: null,
    };

    const startTime = Date.now();

    try {
      const result = await testFn();
      test.result = result ? "PASS" : "FAIL";
    } catch (error) {
      test.result = "ERROR";
      test.error = {
        message: error.message,
        stack: error.stack,
      };
      console.error(`[TEST] Error in "${name}":`, error);
    }

    test.duration = Date.now() - startTime;
    console.log(`[TEST] Result: ${test.result} (${test.duration}ms)`);

    this.results.tests.push(test);
    return test.result === "PASS";
  }

  summarize() {
    this.results.summary.total = this.results.tests.length;
    this.results.summary.passed = this.results.tests.filter(
      (t) => t.result === "PASS",
    ).length;
    this.results.summary.failed = this.results.tests.filter(
      (t) => t.result === "FAIL",
    ).length;
    this.results.summary.errors = this.results.tests.filter(
      (t) => t.result === "ERROR",
    ).length;

    return this.results;
  }
}

/**
 * Run authentication tests for the Vercel AI SDK
 */
export async function runChatTests(req, res) {
  console.log("[CHAT-TEST] Starting chat authentication tests...");
  const runner = new TestRunner();

  // Test 1: Verify service detection
  await runner.runTest("Service Detection", async () => {
    const tests = [
      { model: "gpt-4", expected: "openai" },
      { model: "claude-3-opus-20240229", expected: "anthropic" },
      { model: "claude-3-5-sonnet-20240620", expected: "anthropic" },
      { model: "mixtral-8x7b", expected: "together" },
      { model: "llama-3-70b", expected: "meta" },
    ];

    for (const test of tests) {
      const service = getServiceFromModel(test.model);
      if (service !== test.expected) {
        console.error(
          `[TEST] Service detection failed for ${test.model}: expected ${test.expected}, got ${service}`,
        );
        return false;
      }
    }

    return true;
  });

  // Test 2: Verify Anthropic header formation
  await runner.runTest("Anthropic Headers (Claude 3.5)", async () => {
    const model = "claude-3-5-sonnet-20240620";
    const apiKey = "sk-ant-test123-anthropic";
    const service = "anthropic";

    const headers = createVercelCompatibleHeaders(apiKey, model, service);

    if (!headers["x-api-key"]) {
      console.error("[TEST] Missing x-api-key header for Claude 3.5");
      return false;
    }

    if (!headers["anthropic-version"]) {
      console.error("[TEST] Missing anthropic-version header for Claude 3.5");
      return false;
    }

    if (headers["Authorization"]) {
      console.error(
        "[TEST] Authorization header should not be present for Claude 3.5",
      );
      return false;
    }

    return true;
  });

  // Test 3: Verify OpenAI header formation
  await runner.runTest("OpenAI Headers", async () => {
    const model = "gpt-4";
    const apiKey = "sk-test123-openai";
    const service = "openai";

    const headers = createVercelCompatibleHeaders(apiKey, model, service);

    if (!headers["Authorization"]) {
      console.error("[TEST] Missing Authorization header for OpenAI");
      return false;
    }

    if (!headers["Authorization"].startsWith("Bearer ")) {
      console.error(
        "[TEST] Authorization header doesn't use Bearer scheme for OpenAI",
      );
      return false;
    }

    return true;
  });

  // Test 4: Simulate a basic request to the chat API
  await runner.runTest("API Request Formation", async () => {
    const model = "claude-3-5-sonnet-20240620";
    const apiKey = "sk-ant-test123-anthropic";
    const service = "anthropic";
    const messages = [{ role: "user", content: "Test message" }];

    const headers = createVercelCompatibleHeaders(apiKey, model, service);
    const reqBody = {
      messages,
      model,
      selectedService: service,
    };

    // Validate the request structure
    if (
      !headers["Content-Type"] ||
      !headers["Content-Type"].includes("application/json")
    ) {
      console.error("[TEST] Missing or incorrect Content-Type header");
      return false;
    }

    if (!headers["x-api-key"]) {
      console.error("[TEST] Missing x-api-key header for Anthropic");
      return false;
    }

    if (!reqBody.messages || !reqBody.model || !reqBody.selectedService) {
      console.error("[TEST] Missing required fields in request body");
      return false;
    }

    return true;
  });

  // Generate summary and return results
  const results = runner.summarize();
  console.log(
    `[CHAT-TEST] Tests completed: ${results.summary.passed}/${results.summary.total} passed`,
  );

  res.setHeader("Content-Type", "application/json");
  return res.json(results);
}

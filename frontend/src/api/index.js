import { runAuthTests } from "./authTest";
import { streamChat } from "./chat";
import { getModels } from "./models";
import { runChatTests } from "./testChat";

/**
 * API routes for the frontend
 * This uses a simple express-like middleware pattern
 */
export const apiRoutes = {
  "/api/chat": {
    POST: streamChat,
  },
  "/api/models": {
    GET: getModels,
  },
};

// Helper to handle errors
const asyncHandler = (fn) => async (req, res, next) => {
  try {
    console.log(`🚀 API handler: ${fn.name}`);
    await fn(req, res, next);
    console.log(`✅ API handler complete: ${fn.name}`);
  } catch (error) {
    console.error(`❌ API error in ${fn.name}:`, error);

    // Ensure we haven't already sent a response
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: error.message || "Internal server error",
          stack:
            process.env.NODE_ENV === "development" ? error.stack : undefined,
        }),
      );
    } else {
      console.warn("⚠️ Headers already sent, couldn't send error response");
    }
  }
};

/**
 * Setup API middleware for Vite server
 * This should be added to the vite.config.js file under server.middlewares
 */
export function setupApiMiddleware(app) {
  if (!app || typeof app.use !== "function") {
    console.error("❌ Invalid app object passed to setupApiMiddleware");
    return;
  }

  // Log all API requests
  app.use("/api", (req, res, next) => {
    console.log(`📝 API request: ${req.method} ${req.url}`);

    // Add CORS headers to help with development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    // Handle OPTIONS requests (preflight)
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      return res.end();
    }

    next();
  });

  // Add route handlers using connect-style middleware
  app.use("/api/chat", (req, res, next) => {
    if (req.method === "POST") {
      asyncHandler(streamChat)(req, res, next);
    } else {
      next();
    }
  });

  app.use("/api/models", (req, res, next) => {
    if (req.method === "GET") {
      console.log("📊 Routing to models endpoint handler");
      asyncHandler(getModels)(req, res, next);
    } else {
      next();
    }
  });

  // Add test endpoints
  app.use("/api/auth-test", (req, res, next) => {
    if (req.method === "GET") {
      asyncHandler(runAuthTests)(req, res, next);
    } else {
      next();
    }
  });

  app.use("/api/chat-test", (req, res, next) => {
    if (req.method === "GET") {
      asyncHandler(runChatTests)(req, res, next);
    } else {
      next();
    }
  });

  // Add a simple debug endpoint
  app.use("/api/debug", (req, res, next) => {
    if (req.method === "GET") {
      console.log("🛠️ Debug endpoint called");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ok",
          message: "API is working",
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      next();
    }
  });

  console.log("🔌 API middleware registered for:", [
    "/api/chat",
    "/api/models",
    "/api/auth-test",
    "/api/chat-test",
    "/api/debug",
  ]);
}

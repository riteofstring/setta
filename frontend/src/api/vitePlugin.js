import { setupApiMiddleware } from "./index.js";

/**
 * Creates a Vite plugin that registers our API middleware
 * This is a more reliable way to add the middleware than using configureServer
 */
export default function apiMiddlewarePlugin() {
  return {
    name: "api-middleware-plugin",
    configureServer(server) {
      console.log("🔌 API Middleware Plugin: Registering API routes");

      // Use a 'configureServer' hook to add the middleware
      server.middlewares.use((req, res, next) => {
        console.log(`⚡ API request received: ${req.method} ${req.url}`);
        // Just log the request and pass it on - our middleware will handle actual endpoints
        next();
      });

      // Register our API middleware
      setupApiMiddleware(server.middlewares);

      // Add enhanced debug endpoints
      server.middlewares.use("/api/debug", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            status: "ok",
            message: "API middleware is working",
            timestamp: new Date().toISOString(),
          }),
        );
      });

      // Add a special endpoint to test API keys
      server.middlewares.use("/api/debug/test-key", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify({ error: "Method not allowed" }));
        }

        try {
          // Get the API key and provider from the request
          const body = await new Promise((resolve) => {
            let data = "";
            req.on("data", (chunk) => {
              data += chunk;
            });
            req.on("end", () => {
              resolve(JSON.parse(data));
            });
          });

          const { apiKey, provider } = body;

          if (!apiKey || !provider) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(
              JSON.stringify({
                error: "Missing API key or provider",
                received: { hasApiKey: !!apiKey, provider },
              }),
            );
          }

          // Log key info without exposing the full key
          console.log(`Testing API key for provider: ${provider}`);
          console.log(`Key starts with: ${apiKey.substring(0, 4)}***`);

          // Return success
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              status: "ok",
              message: "API key received",
              keyInfo: {
                provider,
                keyLength: apiKey.length,
                keyPrefix: apiKey.substring(0, 4) + "***",
              },
            }),
          );
        } catch (error) {
          console.error("Error in test-key endpoint:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error.message || "Unknown error" }));
        }
      });
    },
  };
}

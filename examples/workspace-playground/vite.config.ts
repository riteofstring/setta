import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "disable-editor-launch",
      configureServer(server) {
        server.middlewares.use(
          `${server.config.base}__open-in-editor`,
          (_request, response) => {
            response.statusCode = 403;
            response.end("Opening desktop editors over HTTP is disabled.");
          },
        );
      },
    },
  ],
});

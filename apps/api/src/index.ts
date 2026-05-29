import { readApiConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createApiServer } from "./server.js";
import { createAppServices } from "./services/app.js";

const config = readApiConfig();
const logger = createLogger(config.logLevel);
const services = createAppServices(config, logger);
const server = createApiServer(config, logger, services);

server.listen(config.port, config.host, () => {
  logger.info("api_started", {
    host: config.host,
    port: config.port,
    version: config.appVersion,
    commitSha: config.commitSha
  });
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info("api_shutdown_requested", { signal });
  server.close((error) => {
    if (error) {
      logger.error("api_shutdown_failed", { error: error.message });
      process.exit(1);
    }

    services
      .close()
      .then(() => {
        logger.info("api_shutdown_complete");
        process.exit(0);
      })
      .catch((closeError: unknown) => {
        logger.error("api_shutdown_failed", {
          error: closeError instanceof Error ? closeError.message : "unknown_error"
        });
        process.exit(1);
      });
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const levelWeights = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
} as const;

export function createLogger(level: keyof typeof levelWeights): Logger {
  function write(
    messageLevel: keyof typeof levelWeights,
    message: string,
    context: Record<string, unknown> = {}
  ): void {
    if (levelWeights[messageLevel] < levelWeights[level]) {
      return;
    }

    const payload = {
      level: messageLevel,
      message,
      timestamp: new Date().toISOString(),
      ...context
    };
    const line = JSON.stringify(payload);

    if (messageLevel === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
}

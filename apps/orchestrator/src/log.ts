export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

function stamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function createLogger(prefix = ""): Logger {
  const tag = prefix ? `${prefix} ` : "";
  return {
    info: (message) => console.log(`${stamp()} ${tag}${message}`),
    warn: (message) => console.warn(`${stamp()} ${tag}WARN ${message}`),
    error: (message) => console.error(`${stamp()} ${tag}ERROR ${message}`),
  };
}

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

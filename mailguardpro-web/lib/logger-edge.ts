// Edge-safe logger — no Node.js modules, no pino, no crypto
// Used exclusively in proxy.ts (Edge Runtime) where the full logger won't work
// Falls through to console for serverless edge environments

const prefix = "[MailGuard]";

export const loggerEdge = {
  info: (...args: unknown[]) => console.log(prefix, ...args),
  warn: (...args: unknown[]) => console.warn(prefix, ...args),
  error: (...args: unknown[]) => console.error(prefix, ...args),
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(prefix, ...args);
    }
  },
};

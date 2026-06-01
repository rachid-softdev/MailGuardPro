export interface CorsConfig {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposeHeaders: string[];
  maxAge: number;
  credentials: boolean;
}

export const corsConfig: CorsConfig = {
  allowedOrigins: [
    "https://mailguardpro.com",
    "https://www.mailguardpro.com",
    "https://app.mailguardpro.com",
    "https://staging.mailguardpro.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-api-key",
    "Idempotency-Key",
    "X-Requested-With",
    "Accept",
  ],
  exposeHeaders: ["X-Request-Id", "Idempotency-Key", "X-RateLimit-Remaining"],
  maxAge: 86400,
  credentials: true,
};

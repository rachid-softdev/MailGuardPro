import { logger } from "./logger";

type CircuitState = "CLOSED" | "HALF_OPEN" | "OPEN";

interface CircuitBreakerOptions {
  name?: string;
  failureThreshold?: number; // Nb d'échecs avant ouverture (défaut: 5)
  successThreshold?: number; // Nb de succès pour refermer (défaut: 2)
  timeoutMs?: number; // Temps avant de passer HALF_OPEN (défaut: 15_000)
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly options: Required<CircuitBreakerOptions>;
  private readonly logger;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = {
      name: "unnamed",
      failureThreshold: 5,
      successThreshold: 2,
      timeoutMs: 15_000,
      ...options,
    };
    this.logger = logger.child({ circuit: this.options.name });
  }

  async execute<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime >= this.options.timeoutMs) {
        this.state = "HALF_OPEN";
        this.logger.info("Circuit HALF_OPEN — probing Redis");
      } else {
        return fallback();
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      return fallback();
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = "CLOSED";
        this.successCount = 0;
        this.logger.info("Circuit CLOSED — Redis operational");
      }
    }
  }

  private onFailure(error: unknown): void {
    this.successCount = 0;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "OPEN";
      this.logger.warn({ failures: this.failureCount, error }, "Circuit OPEN — Redis unavailable");
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.logger.info("Circuit manually reset to CLOSED");
  }
}

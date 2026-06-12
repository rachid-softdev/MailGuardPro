// RED Metrics — Rate, Errors, Duration monitoring
// Emits structured pino logs for collection by observability pipelines

import { logger } from "./logger";

interface MetricLabels {
  method: string;
  path: string;
  statusCode: number;
  plan?: string;
  authenticated?: boolean;
}

interface RequestMetric {
  labels: MetricLabels;
  durationMs: number;
  error?: boolean;
  requestId?: string;
}

export function emitRequestMetric(metric: RequestMetric): void {
  const { labels, durationMs, error, requestId } = metric;

  logger.info(
    {
      metric: "api_request",
      requestId,
      method: labels.method,
      path: labels.path,
      statusCode: labels.statusCode,
      durationMs,
      error: !!error,
      plan: labels.plan || "anonymous",
      authenticated: labels.authenticated ?? false,
    },
    "RED metric",
  );
}

export function emitErrorMetric(
  labels: MetricLabels,
  durationMs: number,
  error: unknown,
  requestId?: string,
): void {
  logger.error(
    {
      metric: "api_error",
      requestId,
      method: labels.method,
      path: labels.path,
      statusCode: labels.statusCode,
      durationMs,
      err:
        error instanceof Error
          ? { message: error.message, name: error.name }
          : { message: String(error) },
    },
    "RED error metric",
  );
}

export function trackApiRequest<T>(
  fn: () => Promise<T>,
  labels: MetricLabels,
  requestId?: string,
): Promise<T> {
  const startTime = Date.now();
  return fn()
    .then((result) => {
      const durationMs = Date.now() - startTime;
      emitRequestMetric({ labels, durationMs, requestId });
      return result;
    })
    .catch((error: unknown) => {
      const durationMs = Date.now() - startTime;
      emitErrorMetric(labels, durationMs, error, requestId);
      throw error;
    });
}

export function createMetricsMiddleware(labels: MetricLabels) {
  const start = Date.now();
  return {
    finish: (statusCode: number, error?: unknown) => {
      const durationMs = Date.now() - start;
      if (error) {
        emitErrorMetric({ ...labels, statusCode }, durationMs, error);
      } else {
        emitRequestMetric({ labels: { ...labels, statusCode }, durationMs });
      }
    },
  };
}

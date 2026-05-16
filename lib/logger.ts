// Structured Logger Service using Pino
// Provides structured logging for the application

import pino from 'pino'

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Create logger instance
export const logger = pino({
  level: logLevel,
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }
    : {}),
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() }
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service: 'mailguard-pro',
    environment: process.env.NODE_ENV || 'development',
  },
})

// Child loggers for specific modules
export const loggerAuth = logger.child({ module: 'auth' })
export const loggerApi = logger.child({ module: 'api' })
export const loggerValidation = logger.child({ module: 'validation' })
export const loggerWorker = logger.child({ module: 'worker' })
export const loggerWebhook = logger.child({ module: 'webhook' })
export const loggerDb = logger.child({ module: 'database' })
export const loggerStripe = logger.child({ module: 'stripe' })

// Utility functions for common logging patterns
export function logRequest(req: Request, res?: Response) {
  const log = loggerApi.child({
    method: req.method,
    url: req.url,
    headers: {
      userAgent: req.headers.get('user-agent'),
      origin: req.headers.get('origin'),
    },
  })

  if (res) {
    log.info({ status: (res as any).status }, 'Request completed')
  }

  return log
}

export function logError(error: Error, context?: Record<string, any>) {
  logger.error({
    err: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    ...context,
  }, 'Error occurred')
}

export function logMetrics(metrics: Record<string, number>) {
  logger.info({ metrics }, 'Performance metrics')
}

// Create a request-scoped logger
export function createRequestLogger(req: Request) {
  const requestId = (req.headers.get('x-request-id') as string) ||
    (req.headers.get('cf-ray') as string) ||
    Math.random().toString(36).substring(2)

  return logger.child({
    requestId,
    method: req.method,
    url: req.url,
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
  })
}
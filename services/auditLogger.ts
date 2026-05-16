// Audit Logger Service - Log toutes les actions sensibles

import { prisma } from '@/lib/prisma'

export enum AuditAction {
  // User actions
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  USER_LOGIN_FAILED = 'USER_LOGIN_FAILED',

  // API Key actions
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  API_KEY_UPDATED = 'API_KEY_UPDATED',
  API_KEY_USED = 'API_KEY_USED',

  // Webhook actions
  WEBHOOK_CREATED = 'WEBHOOK_CREATED',
  WEBHOOK_UPDATED = 'WEBHOOK_UPDATED',
  WEBHOOK_DELETED = 'WEBHOOK_DELETED',
  WEBHOOK_TRIGGERED = 'WEBHOOK_TRIGGERED',
  WEBHOOK_FAILED = 'WEBHOOK_FAILED',

  // Bulk job actions
  BULK_JOB_CREATED = 'BULK_JOB_CREATED',
  BULK_JOB_STARTED = 'BULK_JOB_STARTED',
  BULK_JOB_COMPLETED = 'BULK_JOB_COMPLETED',
  BULK_JOB_FAILED = 'BULK_JOB_FAILED',

  // Credit actions
  CREDITS_PURCHASED = 'CREDITS_PURCHASED',
  CREDITS_CONSUMED = 'CREDITS_CONSUMED',
  CREDITS_ADJUSTED = 'CREDITS_ADJUSTED',

  // Subscription actions
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_FAILED = 'SUBSCRIPTION_FAILED',

  // Validation actions
  VALIDATION_PERFORMED = 'VALIDATION_PERFORMED',
}

export enum AuditResource {
  USER = 'User',
  API_KEY = 'ApiKey',
  WEBHOOK = 'Webhook',
  BULK_JOB = 'BulkJob',
  VALIDATION = 'Validation',
  SUBSCRIPTION = 'Subscription',
  ORGANIZATION = 'Organization',
}

export interface AuditLogParams {
  userId?: string
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, any>
  email?: string // For API key tracking
}

/**
 * Log an audit event to the database
 * This is async and should not block the main flow
 */
export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: params.metadata as any,
      },
    })
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    console.error('[Audit] Failed to log event:', error)
  }
}

/**
 * Log audit event synchronously (for use in API routes)
 * Wraps the async function
 */
export function logAudit(params: AuditLogParams): void {
  // Fire and forget - don't await
  logAuditEvent(params).catch(console.error)
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
  userId: string,
  options?: {
    limit?: number
    offset?: number
    action?: AuditAction
    resource?: AuditResource
  }
) {
  return prisma.auditLog.findMany({
    where: {
      userId,
      ...(options?.action && { action: options.action }),
      ...(options?.resource && { resource: options.resource }),
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  })
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
  resource: AuditResource,
  resourceId: string,
  options?: {
    limit?: number
    offset?: number
  }
) {
  return prisma.auditLog.findMany({
    where: {
      resource,
      resourceId,
    },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  })
}
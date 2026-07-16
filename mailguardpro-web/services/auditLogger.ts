// Audit Logger Service - Log toutes les actions sensibles

import type { Prisma } from "@prisma/client";
import { hashIp } from "@/lib/ipHash";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export enum AuditAction {
  // User actions
  USER_CREATED = "USER_CREATED",
  USER_UPDATED = "USER_UPDATED",
  USER_DELETED = "USER_DELETED",
  USER_LOGIN = "USER_LOGIN",
  USER_LOGOUT = "USER_LOGOUT",
  USER_LOGIN_FAILED = "USER_LOGIN_FAILED",

  // API Key actions
  API_KEY_CREATED = "API_KEY_CREATED",
  API_KEY_REVOKED = "API_KEY_REVOKED",
  API_KEY_UPDATED = "API_KEY_UPDATED",
  API_KEY_USED = "API_KEY_USED",

  // Webhook actions
  WEBHOOK_CREATED = "WEBHOOK_CREATED",
  WEBHOOK_UPDATED = "WEBHOOK_UPDATED",
  WEBHOOK_DELETED = "WEBHOOK_DELETED",
  WEBHOOK_TRIGGERED = "WEBHOOK_TRIGGERED",
  WEBHOOK_FAILED = "WEBHOOK_FAILED",

  // Bulk job actions
  BULK_JOB_CREATED = "BULK_JOB_CREATED",
  BULK_JOB_STARTED = "BULK_JOB_STARTED",
  BULK_JOB_COMPLETED = "BULK_JOB_COMPLETED",
  BULK_JOB_FAILED = "BULK_JOB_FAILED",

  // Credit actions
  CREDITS_PURCHASED = "CREDITS_PURCHASED",
  CREDITS_CONSUMED = "CREDITS_CONSUMED",
  CREDITS_ADJUSTED = "CREDITS_ADJUSTED",
  CREDITS_LOW_WARNING = "CREDITS_LOW_WARNING",

  // Subscription actions
  SUBSCRIPTION_CREATED = "SUBSCRIPTION_CREATED",
  SUBSCRIPTION_UPDATED = "SUBSCRIPTION_UPDATED",
  SUBSCRIPTION_CANCELLED = "SUBSCRIPTION_CANCELLED",
  SUBSCRIPTION_FAILED = "SUBSCRIPTION_FAILED",

  // Validation actions
  VALIDATION_PERFORMED = "VALIDATION_PERFORMED",

  // Session actions
  SESSION_FORCED_INVALIDATION = "SESSION_FORCED_INVALIDATION",
}

export enum AuditResource {
  USER = "User",
  API_KEY = "ApiKey",
  WEBHOOK = "Webhook",
  BULK_JOB = "BulkJob",
  VALIDATION = "Validation",
  SUBSCRIPTION = "Subscription",
  ORGANIZATION = "Organization",
  SESSION = "Session",
}

export interface AuditLogParams {
  userId?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  email?: string; // For API key tracking
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
        ipAddress: params.ipAddress ? hashIp(params.ipAddress) : undefined,
        userAgent: params.userAgent,
        metadata: params.metadata as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main flow
    logger.error({ err: error }, "Audit: Failed to log event");
  }
}

/**
 * Log audit event synchronously (for use in API routes)
 * Wraps the async function
 */
export function logAudit(params: AuditLogParams): Promise<void> {
  return logAuditEvent(params).catch((e) => logger.error({ err: e }, "Audit log failed"));
}

/**
 * Get audit logs for a specific user
 */
export async function getUserAuditLogs(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    resource?: AuditResource;
  },
) {
  return prisma.auditLog.findMany({
    where: {
      userId,
      ...(options?.action && { action: options.action }),
      ...(options?.resource && { resource: options.resource }),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

/**
 * Get audit logs for a specific resource
 * @param userId Optional scoping by owner. When provided, results are filtered
 *   to that user to prevent cross-tenant disclosure of audit logs.
 */
export async function getResourceAuditLogs(
  resource: AuditResource,
  resourceId: string,
  options?: {
    limit?: number;
    offset?: number;
    userId?: string;
  },
) {
  return prisma.auditLog.findMany({
    where: {
      resource,
      resourceId,
      ...(options?.userId ? { userId: options.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}

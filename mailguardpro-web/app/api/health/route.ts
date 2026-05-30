// Health Check API Endpoint
// Returns the health status of all services

import { prisma } from "@/lib/prisma";
import { checkRateLimit, redis } from "@/lib/redis";
import { getClientIp } from "@/lib/ssrf";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ServiceStatus {
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    app: ServiceStatus;
  };
  version: string;
  environment: string;
}

export async function GET(req?: NextRequest) {
  const startTime = Date.now();

  // Rate limiting (60 req/min per IP — generous to accommodate Docker/ALB/K8s health checks)
  if (req) {
    try {
      const ip = getClientIp(req);
      const rateCheck = await checkRateLimit(`health:ip:${ip}`, 60, 60);
      if (!rateCheck.success) {
        return NextResponse.json(
          { status: "degraded", message: "Rate limit exceeded" },
          {
            status: 429,
            headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
          },
        );
      }
    } catch {
      // Redis down — allow health check to proceed
    }
  }

  const services: HealthResponse["services"] = {
    database: { status: "unhealthy" },
    redis: { status: "unhealthy" },
    app: { status: "healthy" },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    services.database = {
      status: "healthy",
      latencyMs: Date.now() - dbStart,
    };
  } catch (error) {
    services.database = {
      status: "unhealthy",
      error:
        process.env.NODE_ENV === "production"
          ? "Database connection failed"
          : error instanceof Error
            ? error.message
            : "Unknown error",
    };
  }

  // Check Redis (using singleton)
  try {
    const redisStart = Date.now();
    await redis.ping();
    services.redis = {
      status: "healthy",
      latencyMs: Date.now() - redisStart,
    };
  } catch (error) {
    services.redis = {
      status: "unhealthy",
      error:
        process.env.NODE_ENV === "production"
          ? "Redis connection failed"
          : error instanceof Error
            ? error.message
            : "Unknown error",
    };
  }

  // Determine overall status
  const allHealthy = Object.values(services).every((s) => s.status === "healthy");
  const anyUnhealthy = Object.values(services).some((s) => s.status === "unhealthy");

  const overallStatus: "healthy" | "degraded" | "unhealthy" = allHealthy
    ? "healthy"
    : anyUnhealthy
      ? "unhealthy"
      : "degraded";

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services:
      process.env.NODE_ENV === "production"
        ? {
            database: { status: services.database.status },
            redis: { status: services.redis.status },
            app: { status: services.app.status },
          }
        : services,
    version:
      process.env.NODE_ENV === "production" ? "1.0.0" : process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  };

  const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      "Cache-Control": "s-maxage=30, stale-while-revalidate=60",
      "X-Health-Check-Duration": `${Date.now() - startTime}ms`,
    },
  });
}

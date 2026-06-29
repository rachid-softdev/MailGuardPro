// ================================================================
// Framework-Agnostic Middleware Factory Functions
// ================================================================
// These factories produce middleware for any framework.
// The `orgId` resolver function adapts to the framework's auth pattern.
//
// Usage Next.js:
//   export const POST = withFeature("EXPORT_PDF",
//     withLimit("EXPORT_PDF",
//       async (req) => { ... }
//     )
//   )
//
// Usage Express:
//   router.post("/export/pdf",
//     requireFeature("EXPORT_PDF"),
//     consumeFeature("EXPORT_PDF"),
//     exportHandler
//   )
// ================================================================

import type { FeatureGateService } from "./featureGateService";

// ---- Types ----

export type OrgIdResolver<Req = unknown> = (req: Req) => string | Promise<string>;

export type Middleware<Req = unknown, Res = unknown> = (
  req: Req,
  res: Res,
  next: () => void | Promise<void>,
) => void | Promise<void>;

export type Handler<Req = unknown, Res = unknown> = (
  req: Req,
  res: Res,
) => unknown | Promise<unknown>;

export type WrappedHandler<Req = unknown, Res = unknown> = (
  req: Req,
  res: Res,
) => unknown | Promise<unknown>;

// ---- Middleware Factory ----

export interface MiddlewareFactory {
  requireFeature(featureKey: string): Middleware;
  requireLimit(featureKey: string): Middleware;
  consumeFeature(featureKey: string): Middleware;
  withFeature<T>(featureKey: string, handler: Handler<T>): WrappedHandler<T>;
  withLimit<T>(featureKey: string, handler: Handler<T>): WrappedHandler<T>;
  withConsume<T>(featureKey: string, handler: Handler<T>): WrappedHandler<T>;
}

export function createMiddlewareFactory(
  gate: FeatureGateService,
  resolveOrgId: OrgIdResolver,
): MiddlewareFactory {
  // ---- Express-style middlewares ----

  function requireFeature(featureKey: string): Middleware {
    return async (req: any, _res: any, next: () => void | Promise<void>) => {
      try {
        const orgId = await resolveOrgId(req);
        await gate.assertFeature(orgId, featureKey);
        await next();
      } catch (err: any) {
        _res.status(err.statusCode ?? 403).json(err.toJSON?.() ?? { error: "FORBIDDEN" });
      }
    };
  }

  function requireLimit(featureKey: string): Middleware {
    return async (req: any, _res: any, next: () => void | Promise<void>) => {
      try {
        const orgId = await resolveOrgId(req);
        const canConsume = await gate.canConsume(orgId, featureKey);
        if (!canConsume) {
          const limit = await gate.getLimit(orgId, featureKey);
          _res.status(402).json({
            error: "LIMIT_REACHED",
            feature: featureKey,
            limit,
            upgrade_url: "/billing/upgrade",
          });
          return;
        }
        await next();
      } catch (err: any) {
        _res.status(500).json({ error: "INTERNAL_ERROR" });
      }
    };
  }

  function consumeFeature(featureKey: string): Middleware {
    return async (req: any, _res: any, next: () => void | Promise<void>) => {
      try {
        const orgId = await resolveOrgId(req);
        const result = await gate.consume(orgId, featureKey);
        if (!result.success) {
          _res.status(402).json(result);
          return;
        }
        // Attach remaining info to request
        req._featureUsage = req._featureUsage ?? {};
        req._featureUsage[featureKey] = result;
        await next();
      } catch (err: any) {
        _res.status(500).json({ error: "INTERNAL_ERROR" });
      }
    };
  }

  // ---- Next.js-style higher-order functions ----

  function withFeature<T>(featureKey: string, handler: Handler<T>): WrappedHandler<T> {
    return async (req: any, _res: any) => {
      try {
        const orgId = await resolveOrgId(req);
        await gate.assertFeature(orgId, featureKey);
        return handler(req, _res);
      } catch (err: any) {
        return new Response(JSON.stringify(err.toJSON?.() ?? { error: "FORBIDDEN" }), {
          status: err.statusCode ?? 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    };
  }

  function withLimit<T>(featureKey: string, handler: Handler<T>): WrappedHandler<T> {
    return async (req: any, _res: any) => {
      try {
        const orgId = await resolveOrgId(req);
        const canConsume = await gate.canConsume(orgId, featureKey);
        if (!canConsume) {
          const limit = await gate.getLimit(orgId, featureKey);
          return new Response(
            JSON.stringify({
              error: "LIMIT_REACHED",
              feature: featureKey,
              limit,
              upgrade_url: "/billing/upgrade",
            }),
            { status: 402, headers: { "Content-Type": "application/json" } },
          );
        }
        return handler(req, _res);
      } catch {
        return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    };
  }

  function withConsume<T>(featureKey: string, handler: Handler<T>): WrappedHandler<T> {
    return async (req: any, _res: any) => {
      try {
        const orgId = await resolveOrgId(req);
        const result = await gate.consume(orgId, featureKey);
        if (!result.success) {
          return new Response(JSON.stringify(result), {
            status: 402,
            headers: { "Content-Type": "application/json" },
          });
        }
        req._featureUsage = req._featureUsage ?? {};
        req._featureUsage[featureKey] = result;
        return handler(req, _res);
      } catch {
        return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    };
  }

  return {
    requireFeature,
    requireLimit,
    consumeFeature,
    withFeature,
    withLimit,
    withConsume,
  };
}

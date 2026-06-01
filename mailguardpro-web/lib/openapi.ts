// OpenAPI 3.1 specification for MailGuardPro API

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "MailGuardPro API",
    version: "1.0.0",
    description:
      "Email validation and verification API. Validate emails in real-time, perform bulk validation, and manage your account.",
    contact: {
      name: "MailGuardPro Support",
      email: "support@mailguardpro.com",
      url: "https://mailguardpro.com/contact",
    },
  },
  servers: [
    {
      url: "https://api.mailguardpro.com/v1",
      description: "Production",
    },
    {
      url: "https://staging.mailguardpro.com/v1",
      description: "Staging",
    },
    {
      url: "http://localhost:3000/api/v1",
      description: "Local development",
    },
  ],
  paths: {
    // Auth
    "/auth/signin": {
      post: {
        tags: ["Auth"],
        summary: "Sign in to your account",
        operationId: "authSignin",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Sign in successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        user: { $ref: "#/components/schemas/User" },
                        session: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Create a new account",
        operationId: "authSignup",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "name"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Account created successfully" },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/auth/session": {
      get: {
        tags: ["Auth"],
        summary: "Get current session information",
        operationId: "authSession",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current session data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // Validation
    "/validate": {
      get: {
        tags: ["Validation"],
        summary: "Validate a single email address",
        operationId: "validateEmail",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "email",
            in: "query",
            required: true,
            schema: { type: "string", format: "email" },
          },
        ],
        responses: {
          "200": {
            description: "Validation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/ValidationResult" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/validate/history": {
      get: {
        tags: ["Validation"],
        summary: "Get validation history",
        operationId: "validationHistory",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated validation history",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ValidationResult" },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // Bulk
    "/bulk": {
      post: {
        tags: ["Bulk"],
        summary: "Upload a file for bulk email validation",
        operationId: "bulkUpload",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "CSV or TXT file with emails (one per line)",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Bulk job created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/BulkJob" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/bulk/{jobId}/status": {
      get: {
        tags: ["Bulk"],
        summary: "Get bulk job status",
        operationId: "bulkJobStatus",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Job status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/BulkJob" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/bulk/{jobId}/results": {
      get: {
        tags: ["Bulk"],
        summary: "Get bulk job results",
        operationId: "bulkJobResults",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
          {
            name: "status",
            in: "query",
            schema: { type: "string", description: "Filter by status: valid,invalid,risky" },
          },
        ],
        responses: {
          "200": {
            description: "Paginated results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ValidationResult" },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/bulk/{jobId}/export": {
      get: {
        tags: ["Bulk"],
        summary: "Export bulk validation results as CSV",
        operationId: "bulkJobExport",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "jobId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "format",
            in: "query",
            schema: {
              type: "string",
              enum: ["csv", "json"],
              default: "csv",
            },
          },
        ],
        responses: {
          "200": {
            description: "Exported file",
            content: {
              "text/csv": { schema: { type: "string" } },
              "application/json": { schema: { type: "string" } },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // Webhooks
    "/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "List all webhooks",
        operationId: "webhooksList",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "List of webhooks",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Webhook" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
      post: {
        tags: ["Webhooks"],
        summary: "Create a new webhook",
        operationId: "webhookCreate",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url", "name", "events"],
                properties: {
                  url: { type: "string", format: "uri" },
                  name: { type: "string", maxLength: 100 },
                  events: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Webhook created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/Webhook" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
        },
      },
    },
    "/webhooks/{id}": {
      get: {
        tags: ["Webhooks"],
        summary: "Get a webhook by ID",
        operationId: "webhookGet",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Webhook details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/Webhook" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Webhooks"],
        summary: "Update a webhook",
        operationId: "webhookUpdate",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string", format: "uri" },
                  name: { type: "string", maxLength: 100 },
                  events: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                  },
                  isActive: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Webhook updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/Webhook" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      delete: {
        tags: ["Webhooks"],
        summary: "Delete a webhook",
        operationId: "webhookDelete",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Webhook deleted" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/webhooks/{id}/test": {
      post: {
        tags: ["Webhooks"],
        summary: "Send a test payload to a webhook",
        operationId: "webhookTest",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Test request sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    details: {
                      type: "object",
                      properties: {
                        statusCode: { type: "integer" },
                        statusText: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/webhooks/{id}/deliveries": {
      get: {
        tags: ["Webhooks"],
        summary: "List deliveries for a webhook",
        operationId: "webhookDeliveries",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": {
            description: "Paginated delivery list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/WebhookDelivery" },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    // Account
    "/account/credits": {
      get: {
        tags: ["Account"],
        summary: "Get current credit balance",
        operationId: "accountCredits",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "Credit balance",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        credits: { type: "integer" },
                        plan: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/account/usage": {
      get: {
        tags: ["Account"],
        summary: "Get API usage statistics",
        operationId: "accountUsage",
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "Usage statistics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        totalValidations: { type: "integer" },
                        periodStart: { type: "string", format: "date-time" },
                        periodEnd: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/account/api-key/rotate": {
      post: {
        tags: ["Account"],
        summary: "Rotate (regenerate) API key",
        operationId: "apiKeyRotate",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "API key rotated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { $ref: "#/components/schemas/ApiKey" },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },

    // System
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check endpoint",
        operationId: "healthCheck",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    timestamp: { type: "string", format: "date-time" },
                    uptime: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // Tools
    "/tools/spf": {
      get: {
        tags: ["Tools"],
        summary: "Check SPF record for a domain",
        operationId: "checkSpf",
        parameters: [
          {
            name: "domain",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "SPF check result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        domain: { type: "string" },
                        hasSpf: { type: "boolean" },
                        record: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/tools/mx": {
      get: {
        tags: ["Tools"],
        summary: "Check MX records for a domain",
        operationId: "checkMx",
        parameters: [
          {
            name: "domain",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "MX check result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        domain: { type: "string" },
                        hasMx: { type: "boolean" },
                        records: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/tools/dmarc": {
      get: {
        tags: ["Tools"],
        summary: "Check DMARC record for a domain",
        operationId: "checkDmarc",
        parameters: [
          {
            name: "domain",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "DMARC check result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        domain: { type: "string" },
                        hasDmarc: { type: "boolean" },
                        record: { type: "string" },
                        policy: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT-based authentication. Obtain a token via /auth/signin.",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "API key authentication. Create an API key from the dashboard.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", enum: [false] },
          error: { type: "string" },
        },
      },
      ValidationResult: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          status: { type: "string", enum: ["valid", "invalid", "risky", "unknown"] },
          checks: {
            type: "object",
            properties: {
              format: { type: "object", properties: { passed: { type: "boolean" } } },
              mx: { type: "object", properties: { passed: { type: "boolean" } } },
              smtp: { type: "object", properties: { passed: { type: "boolean" } } },
              disposable: { type: "object", properties: { passed: { type: "boolean" } } },
              roleBased: { type: "object", properties: { passed: { type: "boolean" } } },
            },
          },
          processingTimeMs: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      BulkJob: {
        type: "object",
        properties: {
          id: { type: "string" },
          filename: { type: "string" },
          totalEmails: { type: "integer" },
          processed: { type: "integer" },
          status: {
            type: "string",
            enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
          },
          resultUrl: { type: "string", format: "uri", nullable: true },
          reportUrl: { type: "string", format: "uri", nullable: true },
          startedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string", format: "uri" },
          name: { type: "string", nullable: true },
          events: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      WebhookDelivery: {
        type: "object",
        properties: {
          id: { type: "string" },
          webhookId: { type: "string" },
          event: { type: "string" },
          url: { type: "string", format: "uri" },
          status: { type: "string", enum: ["success", "failed", "pending"] },
          statusCode: { type: "integer", nullable: true },
          requestBody: { type: "object" },
          responseBody: { type: "string", nullable: true },
          durationMs: { type: "integer", nullable: true },
          error: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "string" },
          keyPrefix: { type: "string" },
          name: { type: "string" },
          scopes: { type: "string" },
          isActive: { type: "boolean" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string", nullable: true },
          email: { type: "string", format: "email", nullable: true },
          plan: { type: "string", enum: ["FREE", "STARTER", "PRO", "BUSINESS"] },
          credits: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: "Authentication required",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      BadRequest: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      RateLimited: {
        description: "Rate limit exceeded",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean", enum: [false] },
                error: { type: "string" },
                retryAfter: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }, { apiKey: [] }],
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Validation", description: "Email validation endpoints" },
    { name: "Bulk", description: "Bulk email validation" },
    { name: "Webhooks", description: "Webhook management" },
    { name: "Account", description: "Account management" },
    { name: "System", description: "System endpoints" },
    { name: "Tools", description: "DNS lookup tools" },
  ],
};

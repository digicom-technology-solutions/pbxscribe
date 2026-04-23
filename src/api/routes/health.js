// Health check routes
const {getDatabaseConfig} = require("../config/database");
const {SESv2Client, GetAccountCommand} = require("@aws-sdk/client-sesv2");
const {S3Client, ListObjectsV2Command} = require("@aws-sdk/client-s3");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const client = new SESv2Client({region: process.env.AWS_REGION});
const s3Client = new S3Client({region: process.env.AWS_REGION});

/**
 * Register health check routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function healthRoutes(fastify) {
  // Basic health check
  fastify.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Service health check",
        description: "Returns basic service status and uptime.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              service: {type: "string"},
              environment: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              uptime: {type: "number"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      return {
        status: "ok",
        service: "pbxscribe-api",
        environment: process.env.NODE_ENV || "development",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    },
  );

  // Database health check
  fastify.get(
    "/health/db",
    {
      schema: {
        tags: ["Health"],
        summary: "Database health check",
        description:
          "Verifies database connectivity and returns connection details.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              database: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              details: {
                type: "object",
                properties: {
                  host: {type: "string"},
                  port: {type: "integer"},
                  database: {type: "string"},
                  version: {type: "string"},
                  serverTime: {type: "string"},
                },
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              database: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await fastify.pg.query(
          "SELECT version(), current_database(), NOW() as current_time",
        );

        const dbConfig = await getDatabaseConfig();

        return {
          status: "ok",
          database: "connected",
          timestamp: new Date().toISOString(),
          details: {
            host: dbConfig.host,
            port: dbConfig.port,
            database: result.rows[0].current_database,
            version: result.rows[0].version,
            serverTime: result.rows[0].current_time,
          },
        };
      } catch (error) {
        request.log.error("Database health check failed:", error);

        reply.status(503).send({
          status: "error",
          database: "disconnected",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    },
  );

  // Email health check
  fastify.get(
    "/health/email",
    {
      schema: {
        tags: ["Health"],
        summary: "Email health check",
        description:
          "Verifies email service connectivity and returns email stats.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              details: {
                sendingEnabled: {type: "boolean"},
                reviewDetails: {
                  type: "object",
                  properties: {
                    status: {type: "string"},
                    caseId: {type: "string"},
                  },
                },
                sendQuota: {
                  type: "object",
                  properties: {
                    max24HourSend: {type: "integer"},
                    maxSendRate: {type: "integer"},
                    sentLast24Hours: {type: "integer"},
                  },
                },
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const emailResponse = await client.send(new GetAccountCommand({}));
        console.log("Email health check response:", emailResponse);

        const {SendingEnabled, EnforcementStatus, SendQuota, Details} =
          emailResponse;

        return {
          status: EnforcementStatus === "HEALTHY" ? "ok" : "not_ok",
          timestamp: new Date().toISOString(),
          details: {
            sendingEnabled: SendingEnabled,
            reviewDetails: {
              status: Details.ReviewDetails.Status,
              caseId: Details.ReviewDetails.CaseId,
            },
            sendQuota: {
              max24HourSend: SendQuota.Max24HourSend,
              maxSendRate: SendQuota.MaxSendRate,
              sentLast24Hours: SendQuota.SentLast24Hours,
            },
          },
        };
      } catch (error) {
        request.log.error("File Storage health check failed:", error);

        reply.status(503).send({
          status: "error",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    },
  );

  // File Storage health check
  fastify.get(
    "/health/file-storage",
    {
      schema: {
        tags: ["Health"],
        summary: "File Storage health check",
        description:
          "Verifies file storage service connectivity and returns storage stats.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              details: {
                recentFilesLength: {type: "integer"},
                message: {type: "string"},
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      try {
        const response = await s3Client.send(
          new ListObjectsV2Command({
            Bucket: process.env.AWS_FILE_STORAGE_BUCKET_NAME,
            MaxKeys: 1000,
          }),
        );

        if (!response.Contents) {
          return {
            status: "not_ok",
            timestamp: new Date().toISOString(),
            details: {
              recentFilesLength: 0,
              message: `Bucket is empty or no files found.`,
            },
          };
        }

        // 2. Filter files modified within the last 2 days
        const recentFiles = response.Contents.filter((file) => {
          return new Date(file.LastModified) > twoDaysAgo;
        });

        // 3. Output results
        if (recentFiles.length > 0) {
          return {
            status: "ok",
            timestamp: new Date().toISOString(),
            details: {
              recentFilesLength: recentFiles.length,
              message: `Found ${recentFiles.length} files modified in the last 2 days.`,
            },
          };
        } else {
          return {
            status: "not_ok",
            timestamp: new Date().toISOString(),
            details: {
              recentFilesLength: 0,
              message: `No files added in the last 2 days.`,
            },
          };
        }
      } catch (error) {
        request.log.error("File Storage health check failed:", error);
        reply.status(503).send({
          status: "error",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: 503,
          },
        });
      }
    },
  );

  // Notification health check
  fastify.get(
    "/health/notification",
    {
      schema: {
        tags: ["Health"],
        summary: "Notification health check",
        description:
          "Verifies notification service connectivity and returns notification stats.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              details: {
                sendingEnabled: {type: "boolean"},
                reviewDetails: {
                  type: "object",
                  properties: {
                    status: {type: "string"},
                    caseId: {type: "string"},
                  },
                },
                sendQuota: {
                  type: "object",
                  properties: {
                    max24HourSend: {type: "integer"},
                    maxSendRate: {type: "integer"},
                    sentLast24Hours: {type: "integer"},
                  },
                },
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const notificationResponse = await client.send(
          new GetAccountCommand({}),
        );
        console.log(
          "Notification health check response:",
          notificationResponse,
        );

        const {SendingEnabled, EnforcementStatus, SendQuota, Details} =
          notificationResponse;

        return {
          status: EnforcementStatus === "HEALTHY" ? "ok" : "not_ok",
          timestamp: new Date().toISOString(),
          details: {
            sendingEnabled: SendingEnabled,
            reviewDetails: {
              status: Details.ReviewDetails.Status,
              caseId: Details.ReviewDetails.CaseId,
            },
            sendQuota: {
              max24HourSend: SendQuota.Max24HourSend,
              maxSendRate: SendQuota.MaxSendRate,
              sentLast24Hours: SendQuota.SentLast24Hours,
            },
          },
        };
      } catch (error) {
        request.log.error("Notification health check failed:", error);

        reply.status(503).send({
          status: "error",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    },
  );

  // Stripe Status health check
  fastify.get(
    "/health/stripe",
    {
      schema: {
        tags: ["Health"],
        summary: "Stripe health check",
        description: "Verifies Stripe service connectivity and returns status.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              details: {
                isOperational: {type: "boolean"},
                updatedAt: {type: "string", format: "date-time"},
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const start = Date.now();
        await stripe.balance.retrieve();
        const latency = Date.now() - start;

        console.log(`Stripe health check latency: ${latency}ms`);

        return {
          status: "ok",
          timestamp: new Date().toISOString(),
          details: {
            isOperational: true,
            latency: `${latency}ms`,
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error("Stripe health check failed:", error);
        reply.status(503).send({
          status: "error",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: 503,
          },
        });
      }
    },
  );

  // CDN Status health check
  fastify.get(
    "/health/cdn",
    {
      schema: {
        tags: ["Health"],
        summary: "CDN health check",
        description: "Verifies CDN service connectivity and returns status.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              details: {
                isOperational: {type: "boolean"},
                updatedAt: {type: "string", format: "date-time"},
              },
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const start = Date.now();
        const response = await fetch(process.env.FRONTEND_URL, {
          method: "HEAD",
        });
        const latency = Date.now() - start;

        console.log(`Stripe health check latency: ${latency}ms`);

        if (!response.ok) {
          return {
            status: "not_ok",
            timestamp: new Date().toISOString(),
            details: {
              isOperational: false,
              latency: `${latency}ms`,
              updatedAt: new Date().toISOString(),
            },
          };
        }

        return {
          status: "ok",
          timestamp: new Date().toISOString(),
          details: {
            url: process.env.FRONTEND_URL,
            isOperational: true,
            latency: `${latency}ms`,
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error("CDN health check failed:", error);
        reply.status(503).send({
          status: "error",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: 503,
          },
        });
      }
    },
  );

  // Readiness check
  fastify.get(
    "/ready",
    {
      schema: {
        tags: ["Health"],
        summary: "Readiness probe",
        description:
          "Checks if the service is ready to accept traffic (requires DB connectivity).",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
            },
          },
          503: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  code: {type: "string"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await fastify.pg.query("SELECT 1");
        return {
          status: "ready",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        reply.status(503).send({
          status: "error",
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            code: 503,
          },
        });
      }
    },
  );

  // Liveness check (simple ping)
  fastify.get(
    "/live",
    {
      schema: {
        tags: ["Health"],
        summary: "Liveness probe",
        description: "Simple ping to confirm the process is alive.",
        response: {
          200: {
            type: "object",
            properties: {
              status: {type: "string"},
              timestamp: {type: "string", format: "date-time"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      return {
        status: "alive",
        timestamp: new Date().toISOString(),
      };
    },
  );
}

module.exports = healthRoutes;

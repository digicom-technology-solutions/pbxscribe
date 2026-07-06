// User CRUD routes
const {
  createUnprocessedLog,
  listUnprocessedLogs,
  updateUnprocessedLog,
} = require("../repositories/unprocessedLogRepository");

const unprocessedLogSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    client_id: {type: "integer"},
    caller_id: {type: "string"},
    job_name: {type: "string"},
    job_status: {
      type: "string",
      enum: ["UPLOADED", "PROCESSING", "COMPLETED", "FAILED"],
    },
    filename: {type: "string"},
    email_attachment_type: {type: "string"},
    email_subject: {type: "string"},
    email_from_address: {type: "string"},
    email_from_name: {type: "string"},
    to_email_addresses: {type: "string"},
    email_body: {type: "string"},
    voicemail: {type: "string"},
    delivery_status: {
      type: "string",
      enum: ["PROCESSING", "DELIVERED", "FAILED"],
    },
    delivery_timestamp: {type: "string", format: "date-time"},
    sms_delivery_status: {
      type: "string",
      enum: ["PROCESSING", "DELIVERED", "FAILED"],
    },
    sms_delivery_timestamp: {type: "string", format: "date-time"},
    duration_ms: {type: "integer"},
    message_id: {type: "string"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register Unprocessed Logs CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function unprocessedLogsRoutes(fastify) {
  // POST /unprocessed_logs — create log
  fastify.post(
    "/unprocessed_logs",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Unprocessed Logs"],
        summary: "Create an unprocessed log",
        description:
          "Creates a new unprocessed log record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["client_id", "job_name", "job_status", "delivery_status"],
          properties: {
            client_id: {type: "integer"},
            caller_id: {type: "string", minLength: 1, maxLength: 255},
            job_name: {type: "string", minLength: 1, maxLength: 255},
            job_status: {
              type: "string",
              enum: ["UPLOADED", "PROCESSING", "COMPLETED", "FAILED"],
            },
            filename: {type: "string", minLength: 1, maxLength: 255},
            email_attachment_type: {
              type: "string",
              minLength: 1,
              maxLength: 255,
            },
            email_subject: {type: "string", minLength: 1, maxLength: 255},
            email_from_address: {type: "string", minLength: 1, maxLength: 255},
            email_from_name: {type: "string", minLength: 1, maxLength: 255},
            to_email_addresses: {type: "string", minLength: 1, maxLength: 255},
            email_body: {type: "string", minLength: 1, maxLength: 255},
            voicemail: {type: "string", minLength: 1, maxLength: 255},
            delivery_status: {
              type: "string",
              enum: ["PROCESSING", "DELIVERED", "FAILED"],
            },
            delivery_timestamp: {type: "string", format: "date-time"},
            sms_delivery_status: {
              type: "string",
              enum: ["PROCESSING", "DELIVERED", "FAILED"],
            },
            sms_delivery_timestamp: {type: "string", format: "date-time"},
            duration_ms: {type: "integer"},
            message_id: {type: "string", minLength: 1, maxLength: 255},
          },
          additionalProperties: false,
        },
        response: {
          201: unprocessedLogSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        client_id,
        caller_id,
        job_name,
        job_status,
        filename,
        email_attachment_type,
        email_subject,
        email_from_address,
        email_from_name,
        to_email_addresses,
        email_body,
        voicemail,
        delivery_status,
        delivery_timestamp,
        sms_delivery_status,
        sms_delivery_timestamp,
        duration_ms,
        message_id,
      } = request.body;

      try {
        const log = await createUnprocessedLog(fastify.pg, {
          client_id,
          caller_id,
          job_name,
          job_status,
          filename,
          email_attachment_type,
          email_subject,
          email_from_address,
          email_from_name,
          to_email_addresses,
          email_body,
          voicemail,
          delivery_status,
          delivery_timestamp,
          sms_delivery_status,
          sms_delivery_timestamp,
          duration_ms,
          message_id,
        });

        return reply.status(201).send(log);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "An unprocessed log with this email already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /unprocessed_logs — list logs
  fastify.get(
    "/unprocessed_logs/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Unprocessed Logs"],
        summary: "List logs",
        description:
          "Returns a paginated list of unprocessed logs, optionally filtered by status.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            client_id: {type: "integer"},
          },
          required: ["client_id"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: {type: "integer", minimum: 1, maximum: 100, default: 20},
            offset: {type: "integer", minimum: 0, default: 0},
            delivery_status: {
              type: "string",
              enum: ["PROCESSING", "DELIVERED", "FAILED"],
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              logs: {type: "array", items: unprocessedLogSchema},
              total: {type: "integer"},
              limit: {type: "integer"},
              offset: {type: "integer"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {limit, offset, delivery_status} = request.query;
      const {logs, total} = await listUnprocessedLogs(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
          delivery_status,
        },
      );

      return {logs, total, limit, offset};
    },
  );

  // PUT /unprocessed_logs/:id — update unprocessed log
  fastify.put(
    "/unprocessed_logs/client/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Unprocessed Logs"],
        summary: "Update an unprocessed log",
        description:
          "Updates unprocessed log details such as delivery status, job status, delivery timestamp, and message ID of an existing unprocessed log.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            delivery_status: {
              type: "string",
              enum: ["PROCESSING", "DELIVERED", "FAILED"],
            },
            job_status: {
              type: "string",
              enum: ["UPLOADED", "PROCESSING", "COMPLETED", "FAILED"],
            },
            delivery_timestamp: {type: "string", format: "date-time"},
            sms_delivery_status: {
              type: "string",
              enum: ["PROCESSING", "DELIVERED", "FAILED"],
            },
            sms_delivery_timestamp: {type: "string", format: "date-time"},
            duration_ms: {type: "integer"},
            message_id: {type: "string", minLength: 1, maxLength: 255},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: unprocessedLogSchema,
        },
      },
    },
    async (request, reply) => {
      const log = await updateUnprocessedLog(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!log) {
        return reply.status(404).send({
          error: {
            message: "Log not found",
            statusCode: 404,
          },
        });
      }

      return log;
    },
  );
}

module.exports = unprocessedLogsRoutes;

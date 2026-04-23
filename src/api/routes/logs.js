// User CRUD routes
const {
  createLog,
  listLogs,
  updateLog,
} = require("../repositories/logRepository");

const logSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    client_id: {type: "string"},
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
 * Register logs CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function logsRoutes(fastify) {
  // POST /logs — create log
  fastify.post(
    "/logs",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Logs"],
        summary: "Create a log",
        description: "Creates a new log record. Requires authentication.",
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
          201: logSchema,
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
        const log = await createLog(fastify.pg, {
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
              message: "A client with this email already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /logs — list logs
  fastify.get(
    "/logs/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Logs"],
        summary: "List logs",
        description:
          "Returns a paginated list of logs, optionally filtered by status.",
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
              logs: {type: "array", items: logSchema},
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
      const {logs, total} = await listLogs(
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

  // PUT /logs/:id — update log
  fastify.put(
    "/logs/client/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Logs"],
        summary: "Update a log",
        description:
          "Updates log details such as delivery status, job status, delivery timestamp, and message ID of an existing log.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
        },
        body: {
          type: "object",
          properties: {
            delivery_status: {type: "string", minLength: 1, maxLength: 255},
            job_status: {type: "string", minLength: 1, maxLength: 255},
            delivery_timestamp: {type: "string", format: "date-time"},
            sms_delivery_status: {type: "string", minLength: 1, maxLength: 255},
            sms_delivery_timestamp: {type: "string", format: "date-time"},
            duration_ms: {type: "integer"},
            message_id: {type: "string", minLength: 1, maxLength: 255},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: logSchema,
        },
      },
    },
    async (request, reply) => {
      const log = await updateLog(fastify.pg, request.params.id, request.body);

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

module.exports = logsRoutes;

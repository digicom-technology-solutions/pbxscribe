// User CRUD routes
const {
  createSupportTicket,
  findSupportTicketById,
  updateSupportTicket,
  listSupportTickets,
  deleteSupportTicket,
} = require("../repositories/supportTicketRepository");

const supportTicketSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    case_title: {type: "string"},
    case_description: {type: "string"},
    case_status: {type: "string", enum: ["open", "in_progress", "closed"]},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register support ticket CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function supportTicketRoutes(fastify) {
  // POST /support-tickets — create support ticket
  fastify.post(
    "/support-tickets",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Create a support ticket",
        description: "Creates a new support ticket. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "client_id",
            "case_title",
            "case_description",
            "case_status",
          ],
          properties: {
            client_id: {type: "integer"},
            case_title: {type: "string"},
            case_description: {type: "string"},
            case_status: {
              type: "string",
              enum: ["open", "in_progress", "closed"],
            },
          },
          additionalProperties: false,
        },
        response: {
          201: supportTicketSchema,
        },
      },
    },
    async (request, reply) => {
      const {client_id, case_title, case_description, case_status} =
        request.body;

      try {
        const supportTicket = await createSupportTicket(fastify.pg, {
          client_id,
          case_title,
          case_description,
          case_status,
        });

        return reply.status(201).send(supportTicket);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A support ticket with this title already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /support-tickets/client/:client_id — list support tickets for a client
  fastify.get(
    "/support-tickets/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "List support tickets for a client",
        description:
          "Returns a paginated list of support tickets for a specific client, optionally filtered by status.",
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
            status: {type: "string", enum: ["open", "in_progress", "closed"]},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              supportTickets: {type: "array", items: supportTicketSchema},
              total: {type: "integer"},
              limit: {type: "integer"},
              offset: {type: "integer"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {limit, offset, status} = request.query;
      const {supportTickets, total} = await listSupportTickets(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
          status,
        },
      );

      return {supportTickets, total, limit, offset};
    },
  );

  // GET /support-tickets/:id — get support ticket by ID
  fastify.get(
    "/support-tickets/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Get a support ticket",
        description: "Returns a single support ticket by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: supportTicketSchema,
        },
      },
    },
    async (request, reply) => {
      const supportTicket = await findSupportTicketById(
        fastify.pg,
        request.params.id,
      );

      if (!supportTicket) {
        return reply.status(404).send({
          error: {
            message: "Support ticket not found",
            statusCode: 404,
          },
        });
      }

      return supportTicket;
    },
  );

  // PUT /support-tickets/:id — update support ticket
  fastify.put(
    "/support-tickets/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Update a support ticket",
        description: "Updates the details of an existing support ticket.",
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
            case_title: {type: "string", minLength: 1, maxLength: 255},
            case_description: {type: "string", minLength: 1, maxLength: 255},
            case_status: {
              type: "string",
              enum: ["open", "in_progress", "closed"],
            },
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: supportTicketSchema,
        },
      },
    },
    async (request, reply) => {
      const supportTicket = await updateSupportTicket(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!supportTicket) {
        return reply.status(404).send({
          error: {
            message: "Support ticket not found",
            statusCode: 404,
          },
        });
      }

      return supportTicket;
    },
  );

  // DELETE /support-tickets/:id — delete support ticket
  fastify.delete(
    "/support-tickets/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Delete a support ticket",
        description: "Permanently deletes a support ticket record by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          204: {type: "null"},
        },
      },
    },
    async (request, reply) => {
      const deleted = await deleteSupportTicket(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Support ticket not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = supportTicketRoutes;

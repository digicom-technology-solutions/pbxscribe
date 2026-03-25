// User CRUD routes
const {
  createTicketMessage,
  findTicketMessageById,
  updateTicketMessage,
  listTicketMessages,
  deleteTicketMessage,
} = require("../repositories/ticketMessageRepository");

const ticketMessageSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    ticket_id: {type: "integer"},
    message_content: {type: "string"},
    message_timestamp: {type: "string", format: "date-time"},
    attachment_filename: {type: "string"},
    attachment_contenttype: {type: "string"},
    attachment_url: {type: "string"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register ticket message CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function ticketMessageRoutes(fastify) {
  // POST /ticket-messages — create ticket message
  fastify.post(
    "/ticket-messages",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Create a ticket message",
        description: "Creates a new ticket message. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["ticket_id", "message_content", "message_timestamp"],
          properties: {
            ticket_id: {type: "integer"},
            message_content: {type: "string"},
            message_timestamp: {type: "string", format: "date-time"},
            attachment_filename: {type: "string"},
            attachment_contenttype: {type: "string"},
            attachment_url: {type: "string"},
          },
          additionalProperties: false,
        },
        response: {
          201: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        ticket_id,
        message_content,
        message_timestamp,
        attachment_filename,
        attachment_contenttype,
        attachment_url,
      } = request.body;

      try {
        const ticketMessage = await createTicketMessage(fastify.pg, {
          ticket_id,
          message_content,
          message_timestamp,
          attachment_filename,
          attachment_contenttype,
          attachment_url,
        });

        return reply.status(201).send(ticketMessage);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A ticket message with this content already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /ticket-messages/ticket/:ticket_id — list ticket messages for a ticket
  fastify.get(
    "/ticket-messages/ticket/:ticket_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "List ticket messages for a ticket",
        description:
          "Returns a paginated list of ticket messages for a specific ticket, optionally filtered by status.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            ticket_id: {type: "integer"},
          },
          required: ["ticket_id"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: {type: "integer", minimum: 1, maximum: 100, default: 20},
            offset: {type: "integer", minimum: 0, default: 0},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              ticketMessages: {type: "array", items: ticketMessageSchema},
              total: {type: "integer"},
              limit: {type: "integer"},
              offset: {type: "integer"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {limit, offset} = request.query;
      const {ticketMessages, total} = await listTicketMessages(
        fastify.pg,
        request.params.ticket_id,
        {
          limit,
          offset,
        },
      );

      return {ticketMessages, total, limit, offset};
    },
  );

  // GET /ticket-messages/:id — get ticket message by ID
  fastify.get(
    "/ticket-messages/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Get a ticket message",
        description: "Returns a single ticket message by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const ticketMessage = await findTicketMessageById(
        fastify.pg,
        request.params.id,
      );

      if (!ticketMessage) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      return ticketMessage;
    },
  );

  // PUT /ticket-messages/:id — update ticket message
  fastify.put(
    "/ticket-messages/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Update a ticket message",
        description: "Updates the details of an existing ticket message.",
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
            message_content: {type: "string", minLength: 1, maxLength: 255},
            message_timestamp: {
              type: "string",
              format: "date-time",
            },
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const ticketMessage = await updateTicketMessage(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!ticketMessage) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      return ticketMessage;
    },
  );

  // DELETE /ticket-messages/:id — delete ticket message
  fastify.delete(
    "/ticket-messages/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Delete a ticket message",
        description: "Permanently deletes a ticket message record by ID.",
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
      const deleted = await deleteTicketMessage(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = ticketMessageRoutes;

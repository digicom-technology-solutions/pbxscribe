// User CRUD routes
const {
  createPaymentMethod,
  findPaymentMethodById,
  updatePaymentMethod,
  listPaymentMethods,
  deletePaymentMethod,
} = require("../repositories/paymentMethodsRepository");

const paymentMethodSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    card_number: {type: "string", minLength: 10, maxLength: 50},
    cardholder_name: {type: "string", minLength: 1, maxLength: 255},
    security_code: {type: "string", minLength: 3, maxLength: 4},
    expiry_date: {type: "string", format: "date"},
    is_default: {type: "boolean"},
    card_status: {type: "string", enum: ["active", "inactive", "expired"]},
    client_id: {type: "integer"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register payment method CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function paymentMethodRoutes(fastify) {
  // POST /payment-methods — create payment method
  fastify.post(
    "/payment-methods",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Create a payment method",
        description:
          "Creates a new payment method record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "card_number",
            "cardholder_name",
            "security_code",
            "expiry_date",
            "is_default",
            "card_status",
            "client_id",
          ],
          properties: {
            card_number: {type: "string", minLength: 10, maxLength: 50},
            cardholder_name: {type: "string", minLength: 1, maxLength: 255},
            security_code: {type: "string", minLength: 3, maxLength: 4},
            expiry_date: {type: "string", format: "date"},
            is_default: {type: "boolean"},
            card_status: {
              type: "string",
              enum: ["active", "inactive", "expired"],
            },
            client_id: {type: "integer"},
          },
          additionalProperties: false,
        },
        response: {
          201: paymentMethodSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        card_number,
        cardholder_name,
        security_code,
        expiry_date,
        is_default,
        card_status,
        client_id,
      } = request.body;

      try {
        const paymentMethod = await createPaymentMethod(fastify.pg, {
          card_number,
          cardholder_name,
          security_code,
          expiry_date,
          is_default,
          card_status,
          client_id,
        });

        return reply.status(201).send(paymentMethod);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A payment method with this card number already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /payment-methods — list payment methods
  fastify.get(
    "/payment-methods/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "List payment methods",
        description:
          "Returns a paginated list of payment methods, optionally filtered by status.",
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
            status: {type: "string", enum: ["active", "inactive", "expired"]},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              paymentMethods: {type: "array", items: paymentMethodSchema},
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
      const {paymentMethods, total} = await listPaymentMethods(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
          status,
        },
      );

      return {paymentMethods, total, limit, offset};
    },
  );

  // GET /payment-methods/:id — get payment method by ID
  fastify.get(
    "/payment-methods/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Get a payment method",
        description: "Returns a single payment method by UUID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
        },
        response: {
          200: paymentMethodSchema,
        },
      },
    },
    async (request, reply) => {
      const paymentMethod = await findPaymentMethodById(
        fastify.pg,
        request.params.id,
      );

      if (!paymentMethod) {
        return reply.status(404).send({
          error: {
            message: "Payment method not found",
            statusCode: 404,
          },
        });
      }

      return paymentMethod;
    },
  );

  // PUT /payment-methods/:id — update payment method
  fastify.put(
    "/payment-methods/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Update a payment method",
        description:
          "Updates payment method details such as card number, cardholder name, security code, expiry date, and status of an existing payment method.",
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
            card_number: {type: "string", minLength: 10, maxLength: 50},
            cardholder_name: {type: "string", minLength: 1, maxLength: 255},
            security_code: {type: "string", minLength: 3, maxLength: 4},
            expiry_date: {type: "string", format: "date"},
            is_default: {type: "boolean"},
            card_status: {
              type: "string",
              enum: ["active", "inactive", "expired"],
            },
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: paymentMethodSchema,
        },
      },
    },
    async (request, reply) => {
      const paymentMethod = await updatePaymentMethod(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!paymentMethod) {
        return reply.status(404).send({
          error: {
            message: "Payment method not found",
            statusCode: 404,
          },
        });
      }

      return paymentMethod;
    },
  );

  // DELETE /payment-methods/:id — delete payment method
  fastify.delete(
    "/payment-methods/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Delete a payment method",
        description: "Permanently deletes a payment method record by UUID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
        },
        response: {
          204: {type: "null"},
        },
      },
    },
    async (request, reply) => {
      const deleted = await deletePaymentMethod(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Payment method not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = paymentMethodRoutes;

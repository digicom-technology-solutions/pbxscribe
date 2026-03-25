// User CRUD routes
const {
  createInvoice,
  findInvoiceById,
  findInvoiceByName,
  updateInvoice,
  listInvoices,
  deleteInvoice,
} = require("../repositories/invoiceRepository");

const invoiceSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    client_id: {type: "integer"},
    invoice_name: {type: "string"},
    invoice_type: {type: "string", enum: ["monthly", "promotion", "yearly"]},
    invoice_date: {type: "string"},
    plan_id: {type: "integer"},
    invoice_amount: {type: "number"},
    invoice_status: {type: "string", enum: ["pending", "paid", "overdue"]},
    invoice_file_url: {type: "string"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register user CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function invoiceRoutes(fastify) {
  // POST /invoices — create invoice
  fastify.post(
    "/invoices",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Invoices"],
        summary: "Create an invoice",
        description: "Creates a new invoice record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "client_id",
            "invoice_name",
            "invoice_type",
            "invoice_date",
            "plan_id",
            "invoice_amount",
          ],
          properties: {
            client_id: {type: "integer"},
            invoice_name: {type: "string"},
            invoice_type: {
              type: "string",
              enum: ["monthly", "promotion", "yearly"],
            },
            invoice_date: {type: "string", format: "date-time"},
            plan_id: {type: "integer"},
            invoice_amount: {type: "number"},
            invoice_status: {
              type: "string",
              enum: ["pending", "paid", "overdue"],
            },
            invoice_file_url: {type: "string"},
            created_at: {type: "string", format: "date-time"},
            updated_at: {type: "string", format: "date-time"},
          },
          additionalProperties: false,
        },
        response: {
          201: invoiceSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        client_id,
        invoice_name,
        invoice_type,
        invoice_date,
        plan_id,
        invoice_amount,
        invoice_status,
        invoice_file_url,
      } = request.body;

      try {
        const invoice = await createInvoice(fastify.pg, {
          client_id,
          invoice_name,
          invoice_type,
          invoice_date,
          plan_id,
          invoice_amount,
          invoice_status: invoice_status || "pending",
          invoice_file_url: invoice_file_url || null,
        });

        return reply.status(201).send(invoice);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "An invoice with this name already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /invoices/client/:client_id — list invoices
  fastify.get(
    "/invoices/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Invoices"],
        summary: "List invoices",
        description:
          "Returns a paginated list of invoices for a specific client, optionally filtered by status.",
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
            status: {type: "string", enum: ["pending", "paid", "overdue"]},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              invoices: {type: "array", items: invoiceSchema},
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
      const {invoices, total} = await listInvoices(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
          status,
        },
      );

      return {invoices, total, limit, offset};
    },
  );

  // GET /invoices/:id — get invoice by ID
  fastify.get(
    "/invoices/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Invoices"],
        summary: "Get an invoice",
        description: "Returns a single invoice by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: invoiceSchema,
        },
      },
    },
    async (request, reply) => {
      const invoice = await findInvoiceById(fastify.pg, request.params.id);

      if (!invoice) {
        return reply.status(404).send({
          error: {
            message: "Invoice not found",
            statusCode: 404,
          },
        });
      }

      return invoice;
    },
  );

  // GET /invoices/:name — get invoice by name
  fastify.get(
    "/invoices/name/:name",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Invoices"],
        summary: "Get an invoice",
        description: "Returns a single invoice by name.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            name: {type: "string"},
          },
          required: ["name"],
        },
        response: {
          200: invoiceSchema,
        },
      },
    },
    async (request, reply) => {
      const invoice = await findInvoiceByName(fastify.pg, request.params.name);

      if (!invoice) {
        return reply.status(404).send({
          error: {
            message: "Invoice not found",
            statusCode: 404,
          },
        });
      }

      return invoice;
    },
  );

  // PUT /invoices/:id — update invoice
  fastify.put(
    "/invoices/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Invoices"],
        summary: "Update an invoice",
        description: "Updates details of an existing invoice.",
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
            invoice_name: {type: "string", minLength: 1, maxLength: 255},
            invoice_status: {type: "string", minLength: 1, maxLength: 255},
            invoice_amount: {type: "number", minimum: 0},
            invoice_type: {type: "string", minLength: 1, maxLength: 255},
            invoice_date: {type: "string", format: "date-time"},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: invoiceSchema,
        },
      },
    },
    async (request, reply) => {
      const invoice = await updateInvoice(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!invoice) {
        return reply.status(404).send({
          error: {
            message: "Invoice not found",
            statusCode: 404,
          },
        });
      }

      return invoice;
    },
  );

  // DELETE /invoices/:id — delete invoice
  fastify.delete(
    "/invoices/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Invoices"],
        summary: "Delete an invoice",
        description: "Permanently deletes an invoice record by ID.",
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
      const deleted = await deleteInvoice(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Invoice not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = invoiceRoutes;

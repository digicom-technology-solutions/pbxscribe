// User CRUD routes
const {
  findInvoiceById,
  listInvoices,
} = require("../repositories/invoiceRepository");
const {findClientById} = require("../repositories/clientRepository");

const invoiceSchema = {
  type: "object",
  properties: {
    id: {type: "string"},
    object: {type: "string", enum: ["invoice"]},
    account_country: {type: "string"},
    account_name: {type: "string"},
    account_tax_ids: {type: ["null", "array"]},
    amount_due: {type: "number"},
    amount_overpaid: {type: "number"},
    amount_paid: {type: "number"},
    amount_remaining: {type: "number"},
    amount_shipping: {type: "number"},
    application: {type: ["null", "string"]},
    attempt_count: {type: "number"},
    attempted: {type: "boolean"},
    auto_advance: {type: "boolean"},
    automatic_tax: {type: "object"},
    automatically_finalizes_at: {type: ["null", "string"]},
    billing_reason: {type: "string"},
    collection_method: {type: "string"},
    created: {type: "number"},
    currency: {type: "string"},
    custom_fields: {type: ["null", "array"]},
    customer: {type: "string"},
    customer_account: {type: ["null", "string"]},
    customer_address: {type: ["null", "object"]},
    customer_email: {type: ["null", "string"]},
    customer_name: {type: ["null", "string"]},
    customer_phone: {type: ["null", "string"]},
    customer_shipping: {type: ["null", "object"]},
    customer_tax_exempt: {type: ["null", "string"]},
    customer_tax_ids: {type: ["null", "array"]},
    default_payment_method: {type: ["null", "string"]},
    default_source: {type: ["null", "string"]},
    default_tax_rates: {type: ["null", "array"]},
    description: {type: ["null", "string"]},
    discounts: {type: ["null", "array"]},
    due_date: {type: ["null", "number"]},
    effective_at: {type: ["null", "number"]},
    ending_balance: {type: ["null", "number"]},
    footer: {type: ["null", "string"]},
    from_invoice: {type: ["null", "string"]},
    hosted_invoice_url: {type: ["null", "string"]},
    invoice_pdf: {type: ["null", "string"]},
    issuer: {type: ["null", "object"]},
    last_finalization_error: {type: ["null", "object"]},
    latest_revision: {type: ["null", "object"]},
    lines: {type: ["null", "object"]},
    livemode: {type: "boolean"},
    metadata: {type: "object"},
    next_payment_attempt: {type: ["null", "number"]},
    number: {type: ["null", "string"]},
    on_behalf_of: {type: ["null", "string"]},
    parent: {type: ["null", "object"]},
    payment_settings: {type: ["null", "object"]},
    period_end: {type: ["null", "number"]},
    period_start: {type: ["null", "number"]},
    post_payment_credit_notes_amount: {type: ["null", "number"]},
    pre_payment_credit_notes_amount: {type: ["null", "number"]},
    receipt_number: {type: ["null", "string"]},
    rendering: {type: ["null", "object"]},
    shipping_cost: {type: ["null", "object"]},
    shipping_details: {type: ["null", "object"]},
    starting_balance: {type: ["null", "number"]},
    statement_descriptor: {type: ["null", "string"]},
    status: {
      type: "string",
      enum: ["draft", "open", "paid", "uncollectible", "void"],
    },
    status_transitions: {type: ["null", "object"]},
    subtotal: {type: ["null", "number"]},
    subtotal_excluding_tax: {type: ["null", "number"]},
    test_clock: {type: ["null", "string"]},
    total: {type: ["null", "number"]},
    total_discount_amounts: {type: ["null", "array"]},
    total_excluding_tax: {type: ["null", "number"]},
    total_pretax_credit_amounts: {type: ["null", "array"]},
    total_taxes: {type: ["null", "array"]},
    webhooks_delivered_at: {type: ["null", "number"]},
  },
};

/**
 * Register invoice CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function invoiceRoutes(fastify) {
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
            status: {
              type: "string",
              enum: ["draft", "open", "paid", "uncollectible", "void"],
            },
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
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {limit, status} = request.query;
      console.log(
        "Received request to list invoices for client_id:",
        request.params.client_id,
        "with query:",
        request.query,
      );
      const client = await findClientById(fastify.pg, request.params.client_id);

      console.log("Client found:", client);

      if (!client) {
        return reply.status(404).send({
          error: {
            message: "Client not found",
            statusCode: 404,
          },
        });
      }

      const {invoices, total} = await listInvoices(client.stripe_customer_id, {
        limit,
        status,
      });

      return {invoices, total, limit};
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
}

module.exports = invoiceRoutes;

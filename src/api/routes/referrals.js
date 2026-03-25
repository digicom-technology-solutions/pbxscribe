// User CRUD routes
const {
  createReferral,
  findReferralById,
  updateReferral,
  listReferrals,
  deleteReferral,
} = require("../repositories/referralRepository");
const {
  createInvoice,
  findInvoiceByType,
  findInvoiceById,
} = require("../repositories/invoiceRepository");
const {findClientById} = require("../repositories/clientRepository");

const referralSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    referral_bonus: {type: "number"},
    client_id: {type: "integer"},
    referral_client_id: {type: "integer"},
    invoice_id: {type: "integer"},
    client: {
      client_id: {type: "integer"},
      client_name: {type: "string"},
      client_category: {type: "string"},
      client_email: {type: "string", format: "email"},
      client_address: {type: "string"},
      client_phone: {type: "string"},
      timezone: {
        type: "string",
        enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
      },
      client_status: {
        type: "string",
        enum: ["active", "inactive", "suspended"],
      },
      client_referral_link: {type: "string"},
    },
    referral_client: {
      client_id: {type: "integer"},
      client_name: {type: "string"},
      client_category: {type: "string"},
      client_email: {type: "string", format: "email"},
      client_address: {type: "string"},
      client_phone: {type: "string"},
      timezone: {
        type: "string",
        enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
      },
      client_status: {
        type: "string",
        enum: ["active", "inactive", "suspended"],
      },
      client_referral_link: {type: "string"},
    },
    invoice: {
      invoice_id: {type: "integer"},
      invoice_name: {type: "string"},
      invoice_type: {type: "string"},
      invoice_date: {type: "string", format: "date-time"},
      plan_id: {type: "integer"},
      invoice_amount: {type: "number"},
      invoice_status: {type: "string"},
      invoice_file_url: {type: "string"},
    },
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register referral CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function referralRoutes(fastify) {
  // POST /referrals — create referral
  fastify.post(
    "/referrals",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Referrals"],
        summary: "Create a referral",
        description: "Creates a new referral record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["client_id", "referral_client_id", "referral_bonus"],
          properties: {
            client_id: {type: "integer"},
            referral_client_id: {type: "integer"},
            referral_bonus: {type: "number"},
          },
          additionalProperties: false,
        },
        response: {
          201: referralSchema,
        },
      },
    },
    async (request, reply) => {
      const {client_id, referral_client_id, referral_bonus} = request.body;

      if (client_id === referral_client_id) {
        return reply.status(400).send({
          error: {
            message: "Client cannot refer themselves",
            statusCode: 400,
          },
        });
      }

      const clientConn = await fastify.pg.connect();

      try {
        await clientConn.query("BEGIN");
        const client = await findClientById(fastify.pg, client_id);
        const referralClient = await findClientById(
          fastify.pg,
          referral_client_id,
        );

        if (!client || !referralClient) {
          await clientConn.query("ROLLBACK");
          return reply.status(404).send({
            error: {
              message: "Client or referral client not found",
              statusCode: 404,
            },
          });
        }

        const lastInvoice = await findInvoiceByType(fastify.pg, "promotion");
        let nextNum = 1;
        if (lastInvoice) {
          const lastParts = lastInvoice?.invoice_name?.split("-");
          nextNum = parseInt(lastParts[1] || "0", 10) + 1;
        }
        const invoiceName = `REF-${nextNum.toString().padStart(3, "0")}`;

        const invoice = await createInvoice(fastify.pg, {
          client_id,
          invoice_name: invoiceName,
          invoice_type: "promotion",
          invoice_date: new Date().toISOString(),
          plan_id: client.plan_id,
          invoice_amount: referral_bonus,
          invoice_status: "pending",
          invoice_file_url: null,
        });
        console.log("Created invoice:", invoice.id);

        const referral = await createReferral(fastify.pg, {
          client_id,
          referral_client_id,
          invoice_id: invoice.id,
          referral_bonus,
        });

        await clientConn.query("COMMIT");
        return reply.status(201).send({
          id: referral.id,
          referral_bonus: referral.referral_bonus,
          client_id: referral.client_id,
          referral_client_id: referral.referral_client_id,
          invoice_id: referral.invoice_id,
          client: {
            client_id: referral.client_id,
            client_name: client.client_name,
            client_category: client.client_category,
            client_email: client.client_email,
            client_address: client.client_address,
            client_phone: client.client_phone,
            timezone: client.timezone,
            client_status: client.client_status,
            client_referral_link: client.client_referral_link,
          },
          referral_client: {
            client_id: referral.referral_client_id,
            client_name: referralClient.client_name,
            client_category: referralClient.client_category,
            client_email: referralClient.client_email,
            client_address: referralClient.client_address,
            client_phone: referralClient.client_phone,
            timezone: referralClient.timezone,
            client_status: referralClient.client_status,
            client_referral_link: referralClient.client_referral_link,
          },
          invoice: {
            invoice_id: referral.invoice_id,
            invoice_name: invoice.invoice_name,
            invoice_type: invoice.invoice_type,
            invoice_date: invoice.invoice_date,
            plan_id: invoice.plan_id,
            invoice_amount: invoice.invoice_amount,
            invoice_status: invoice.invoice_status,
            invoice_file_url: invoice.invoice_file_url,
          },
          created_at: referral.created_at,
          updated_at: referral.updated_at,
        });
      } catch (error) {
        await clientConn.query("ROLLBACK");

        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A referral with this id already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      } finally {
        clientConn.release();
      }
    },
  );

  // GET /referrals — list referrals
  fastify.get(
    "/referrals/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Referrals"],
        summary: "List referrals",
        description:
          "Returns a paginated list of referrals, optionally filtered by status.",
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
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              referrals: {type: "array", items: referralSchema},
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
      const {referrals, total} = await listReferrals(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
        },
      );

      for (const referral of referrals) {
        const client = await findClientById(fastify.pg, referral.client_id);
        const referralClient = await findClientById(
          fastify.pg,
          referral.referral_client_id,
        );
        const invoice = await findInvoiceById(fastify.pg, referral.invoice_id);

        console.log("Referral:", JSON.stringify(referral));
        console.log("Client:", JSON.stringify(client));
        console.log("Referral Client:", JSON.stringify(referralClient));
        console.log("Invoice:", JSON.stringify(invoice));

        referral.client = {
          client_id: referral?.client_id,
          client_name: client?.client_name,
          client_category: client?.client_category,
          client_email: client?.client_email,
          client_address: client?.client_address,
          client_phone: client?.client_phone,
          timezone: client?.timezone,
          client_status: client?.client_status,
          client_referral_link: client?.client_referral_link,
        };

        referral.referral_client = {
          client_id: referral?.referral_client_id,
          client_name: referralClient?.client_name,
          client_category: referralClient?.client_category,
          client_email: referralClient?.client_email,
          client_address: referralClient?.client_address,
          client_phone: referralClient?.client_phone,
          timezone: referralClient?.timezone,
          client_status: referralClient?.client_status,
          client_referral_link: referralClient?.client_referral_link,
        };

        referral.invoice = {
          invoice_id: referral.invoice_id,
          invoice_name: invoice?.invoice_name,
          invoice_type: invoice?.invoice_type,
          invoice_date: invoice?.invoice_date,
          plan_id: invoice?.plan_id,
          invoice_amount: invoice?.invoice_amount,
          invoice_status: invoice?.invoice_status,
          invoice_file_url: invoice?.invoice_file_url,
        };
      }

      return {referrals, total, limit, offset};
    },
  );

  // GET /referrals/:id — get referral by ID
  fastify.get(
    "/referrals/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Referrals"],
        summary: "Get a referral",
        description: "Returns a single referral by UUID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: referralSchema,
        },
      },
    },
    async (request, reply) => {
      const referral = await findReferralById(fastify.pg, request.params.id);

      if (!referral) {
        return reply.status(404).send({
          error: {
            message: "Referral not found",
            statusCode: 404,
          },
        });
      }

      const client = await findClientById(fastify.pg, referral.client_id);
      const referralClient = await findClientById(
        fastify.pg,
        referral.referral_client_id,
      );
      const invoice = await findInvoiceById(fastify.pg, referral.invoice_id);

      console.log("Referral:", JSON.stringify(referral));
      console.log("Client:", JSON.stringify(client));
      console.log("Referral Client:", JSON.stringify(referralClient));
      console.log("Invoice:", JSON.stringify(invoice));

      referral.client = {
        client_id: referral?.client_id,
        client_name: client?.client_name,
        client_category: client?.client_category,
        client_email: client?.client_email,
        client_address: client?.client_address,
        client_phone: client?.client_phone,
        timezone: client?.timezone,
        client_status: client?.client_status,
        client_referral_link: client?.client_referral_link,
      };

      referral.referral_client = {
        client_id: referral?.referral_client_id,
        client_name: referralClient?.client_name,
        client_category: referralClient?.client_category,
        client_email: referralClient?.client_email,
        client_address: referralClient?.client_address,
        client_phone: referralClient?.client_phone,
        timezone: referralClient?.timezone,
        client_status: referralClient?.client_status,
        client_referral_link: referralClient?.client_referral_link,
      };

      referral.invoice = {
        invoice_id: referral.invoice_id,
        invoice_name: invoice?.invoice_name,
        invoice_type: invoice?.invoice_type,
        invoice_date: invoice?.invoice_date,
        plan_id: invoice?.plan_id,
        invoice_amount: invoice?.invoice_amount,
        invoice_status: invoice?.invoice_status,
        invoice_file_url: invoice?.invoice_file_url,
      };

      return referral;
    },
  );

  // PUT /referrals/:id — update referral
  fastify.put(
    "/referrals/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Referrals"],
        summary: "Update a referral",
        description: "Updates the details of an existing referral.",
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
            amount: {type: "integer", minimum: 1},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: referralSchema,
        },
      },
    },
    async (request, reply) => {
      const referral = await updateReferral(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!referral) {
        return reply.status(404).send({
          error: {
            message: "Referral not found",
            statusCode: 404,
          },
        });
      }

      return referral;
    },
  );

  // DELETE /referrals/:id — delete referral
  fastify.delete(
    "/referrals/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Referrals"],
        summary: "Delete a referral",
        description: "Permanently deletes a referral record by UUID.",
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
      const deleted = await deleteReferral(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Referral not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = referralRoutes;

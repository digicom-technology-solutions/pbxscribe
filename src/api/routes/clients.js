// User CRUD routes
const {
  createClient,
  findClientById,
  findClientByEmail,
  updateClient,
  listClients,
  deleteClient,
  findClientByReferralLink,
} = require("../repositories/clientRepository");
const {findPlanById} = require("../repositories/subscriptionPlanRepository");
const crypto = require("crypto");

const clientSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    client_name: {type: "string"},
    plan_id: {type: "integer"},
    client_category: {type: "string"},
    client_email: {type: "string", format: "email"},
    client_address: {type: "string"},
    client_phone: {type: "string"},
    timezone: {
      type: "string",
      enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
    },
    client_status: {type: "string", enum: ["active", "inactive", "suspended"]},
    client_referral_link: {type: "string"},
    delivery_failure_notification: {type: "boolean"},
    usage_alert_notification: {type: "boolean"},
    system_alert_notification: {type: "boolean"},
    referral_link: {type: "string"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
    referredby_client: {
      type: "object",
      properties: {
        id: {type: "integer"},
        client_name: {type: "string"},
        plan_id: {type: "integer"},
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
        created_at: {type: "string", format: "date-time"},
        updated_at: {type: "string", format: "date-time"},
      },
    },
    subscription_plan: {
      type: "object",
      properties: {
        plan_id: {type: "integer"},
        plan_name: {type: "string"},
        plan_type: {type: "string"},
        plan_monthly_amount: {type: "number"},
        plan_yearly_amount: {type: "number"},
        plan_voicemails: {type: "number"},
        plan_email_delivery: {type: "boolean"},
        plan_sms_delivery: {type: "boolean"},
        plan_voicebox: {type: "boolean"},
        plan_support: {type: "boolean"},
      },
    },
  },
};

/**
 * Register client CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function clientRoutes(fastify) {
  // POST /clients — create client
  fastify.post(
    "/clients",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Clients"],
        summary: "Create a client",
        description: "Creates a new client record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "client_name",
            "plan_id",
            "client_category",
            "client_email",
          ],
          properties: {
            client_name: {type: "string", minLength: 1, maxLength: 255},
            plan_id: {type: "integer"},
            client_category: {type: "string", minLength: 3, maxLength: 255},
            client_email: {type: "string", format: "email"},
            client_phone: {type: "string", minLength: 10, maxLength: 15},
            client_address: {type: "string", minLength: 3, maxLength: 255},
            timezone: {
              type: "string",
              enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
            },
            client_status: {
              type: "string",
              enum: ["active", "inactive", "suspended"],
            },
            referral_link: {type: "string"},
            delivery_failure_notification: {type: "boolean"},
            usage_alert_notification: {type: "boolean"},
            system_alert_notification: {type: "boolean"},
          },
          additionalProperties: false,
        },
        response: {
          201: clientSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        client_name,
        plan_id,
        client_category,
        client_email,
        client_address,
        client_phone,
        timezone,
        client_status,
        referral_link,
        delivery_failure_notification,
        usage_alert_notification,
        system_alert_notification,
      } = request.body;

      try {
        const client_referral_link = `https://${process.env.PBXSCRIBE_DOMAIN || "pbxscribe.com"}/referral/${crypto.randomUUID() || "31236f14-1544-45c2-86ec-d5198d57070e"}`;
        const client = await createClient(fastify.pg, {
          client_name,
          plan_id,
          client_category,
          client_email,
          client_address,
          client_phone,
          timezone,
          client_status,
          client_referral_link,
          delivery_failure_notification,
          usage_alert_notification,
          system_alert_notification,
        });

        let referredby_client = null;
        if (referral_link) {
          referredby_client = await findClientByReferralLink(
            fastify.pg,
            referral_link,
          );
        }

        const subscriptionPlan = await findPlanById(fastify.pg, client.plan_id);

        return reply.status(201).send({
          id: client.id,
          client_name: client.client_name,
          plan_id: client.plan_id,
          client_category: client.client_category,
          client_email: client.client_email,
          client_address: client.client_address,
          client_phone: client.client_phone,
          timezone: client.timezone,
          client_status: client.client_status,
          client_referral_link: client.client_referral_link,
          referral_link: referral_link || null,
          delivery_failure_notification: client.delivery_failure_notification,
          usage_alert_notification: client.usage_alert_notification,
          system_alert_notification: client.system_alert_notification,
          created_at: client.created_at,
          updated_at: client.updated_at,
          referredby_client: referredby_client,
          subscription_plan: subscriptionPlan,
        });
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

  // GET /clients — list clients
  fastify.get(
    "/clients",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Clients"],
        summary: "List clients",
        description:
          "Returns a paginated list of clients, optionally filtered by status.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        querystring: {
          type: "object",
          properties: {
            limit: {type: "integer", minimum: 1, maximum: 100, default: 20},
            offset: {type: "integer", minimum: 0, default: 0},
            status: {type: "string", enum: ["active", "inactive", "suspended"]},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              clients: {type: "array", items: clientSchema},
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
      const {clients, total} = await listClients(fastify.pg, {
        limit,
        offset,
        status,
      });

      for (const client of clients) {
        client.subscription_plan = await findPlanById(
          fastify.pg,
          client.plan_id,
        );
      }

      return {clients, total, limit, offset};
    },
  );

  // GET /clients/:id — get client by ID
  fastify.get(
    "/clients/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Clients"],
        summary: "Get a client",
        description: "Returns a single client by UUID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
        },
        response: {
          200: clientSchema,
        },
      },
    },
    async (request, reply) => {
      const client = await findClientById(fastify.pg, request.params.id);

      if (!client) {
        return reply.status(404).send({
          error: {
            message: "Client not found",
            statusCode: 404,
          },
        });
      }

      client.subscription_plan = await findPlanById(fastify.pg, client.plan_id);

      return client;
    },
  );

  // GET /clients/:email — get client by email
  fastify.get(
    "/clients/email/:email",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Clients"],
        summary: "Get a client",
        description: "Returns a single client by email.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            email: {type: "string", format: "email"},
          },
        },
        response: {
          200: clientSchema,
        },
      },
    },
    async (request, reply) => {
      const client = await findClientByEmail(fastify.pg, request.params.email);

      if (!client) {
        return reply.status(404).send({
          error: {
            message: "Client not found",
            statusCode: 404,
          },
        });
      }

      client.subscription_plan = await findPlanById(fastify.pg, client.plan_id);

      return client;
    },
  );

  // PUT /clients/:id — update client
  fastify.put(
    "/clients/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Clients"],
        summary: "Update a client",
        description:
          "Updates client name, subscription plan, client category, email, phone, address, timezone, and/or status of an existing client.",
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
            client_name: {type: "string", minLength: 1, maxLength: 255},
            plan_id: {type: "integer"},
            client_email: {type: "string", format: "email"},
            client_phone: {type: "string", minLength: 10, maxLength: 15},
            client_address: {type: "string", minLength: 3, maxLength: 255},
            timezone: {
              type: "string",
              enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
            },
            client_status: {
              type: "string",
              enum: ["active", "inactive", "suspended"],
            },
            delivery_failure_notification: {type: "boolean"},
            usage_alert_notification: {type: "boolean"},
            system_alert_notification: {type: "boolean"},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: clientSchema,
        },
      },
    },
    async (request, reply) => {
      const client = await updateClient(
        fastify.pg,
        request.params.id,
        request.body,
      );

      client.subscription_plan = await findPlanById(fastify.pg, client.plan_id);

      return client;
    },
  );

  // DELETE /clients/:id — delete client
  fastify.delete(
    "/clients/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Clients"],
        summary: "Delete a client",
        description: "Permanently deletes a client record by UUID.",
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
      const deleted = await deleteClient(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Client not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = clientRoutes;

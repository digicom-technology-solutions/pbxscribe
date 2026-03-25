// User CRUD routes
const {
  createSubscriptionPlan,
  findPlanById,
  findPlanByName,
  updatePlan,
  listSubscriptionPlans,
  deleteSubscriptionPlan,
} = require("../repositories/subscriptionPlanRepository");
const {createCredential} = require("../repositories/credentialRepository");
const {hashPassword, checkPasswordStrength} = require("../utils/password");

const subscriptionPlanSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    plan_name: {type: "string"},
    plan_type: {type: "string"},
    plan_monthly_amount: {type: "number"},
    plan_yearly_amount: {type: "number"},
    plan_voicemails: {type: "number"},
    plan_email_delivery: {type: "boolean"},
    plan_sms_delivery: {type: "boolean"},
    plan_voicebox: {type: "boolean"},
    plan_support: {type: "boolean"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register subscription plan CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function subscriptionPlanRoutes(fastify) {
  // POST /subscription-plans — create subscription plan
  fastify.post(
    "/subscription-plans",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "Create a subscription plan",
        description:
          "Creates a new subscription plan. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "plan_name",
            "plan_type",
            "plan_monthly_amount",
            "plan_yearly_amount",
          ],
          properties: {
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
          additionalProperties: false,
        },
        response: {
          201: subscriptionPlanSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        plan_name,
        plan_type,
        plan_monthly_amount,
        plan_yearly_amount,
        plan_voicemails,
        plan_email_delivery,
        plan_sms_delivery,
        plan_voicebox,
        plan_support,
      } = request.body;

      try {
        const subscriptionPlan = await createSubscriptionPlan(fastify.pg, {
          plan_name,
          plan_type,
          plan_monthly_amount,
          plan_yearly_amount,
          plan_voicemails,
          plan_email_delivery,
          plan_sms_delivery,
          plan_voicebox,
          plan_support,
        });

        return reply.status(201).send(subscriptionPlan);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A subscription plan with this name already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /subscription-plans — list subscription plans for a client
  fastify.get(
    "/subscription-plans",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "List subscription plans for a client",
        description:
          "Returns a paginated list of subscription plans for a client, optionally filtered by status.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
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
              subscriptionPlans: {type: "array", items: subscriptionPlanSchema},
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
      const {subscriptionPlans, total} = await listSubscriptionPlans(
        fastify.pg,
        {
          limit,
          offset,
        },
      );

      return {subscriptionPlans, total, limit, offset};
    },
  );

  // GET /subscription-plans/:id — get subscription plan by ID
  fastify.get(
    "/subscription-plans/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "Get a subscription plan by ID",
        description: "Returns a single subscription plan by UUID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: subscriptionPlanSchema,
        },
      },
    },
    async (request, reply) => {
      const subscriptionPlan = await findPlanById(
        fastify.pg,
        request.params.id,
      );

      if (!subscriptionPlan) {
        return reply.status(404).send({
          error: {
            message: "Subscription plan not found",
            statusCode: 404,
          },
        });
      }

      return subscriptionPlan;
    },
  );

  // GET /subscription-plans/:name — get subscription plan by name
  fastify.get(
    "/subscription-plans/name/:name",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "Get a subscription plan by name",
        description: "Returns a single subscription plan by name.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            name: {type: "string"},
          },
          required: ["name"],
        },
        response: {
          200: subscriptionPlanSchema,
        },
      },
    },
    async (request, reply) => {
      const subscriptionPlan = await findPlanByName(
        fastify.pg,
        request.params.name,
      );

      if (!subscriptionPlan) {
        return reply.status(404).send({
          error: {
            message: "Subscription plan not found",
            statusCode: 404,
          },
        });
      }

      return subscriptionPlan;
    },
  );

  // PUT /subscription-plans/:id — update subscription plan
  fastify.put(
    "/subscription-plans/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "Update a subscription plan",
        description: "Updates the details of an existing subscription plan.",
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
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: subscriptionPlanSchema,
        },
      },
    },
    async (request, reply) => {
      const subscriptionPlan = await updatePlan(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!subscriptionPlan) {
        return reply.status(404).send({
          error: {
            message: "Subscription plan not found",
            statusCode: 404,
          },
        });
      }

      return subscriptionPlan;
    },
  );

  // DELETE /subscription-plans/:id — delete subscription plan
  fastify.delete(
    "/subscription-plans/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "Delete a subscription plan",
        description: "Permanently deletes a subscription plan by ID.",
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
      const deleted = await deleteSubscriptionPlan(
        fastify.pg,
        request.params.id,
      );

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Subscription plan not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = subscriptionPlanRoutes;

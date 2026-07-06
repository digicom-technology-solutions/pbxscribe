const Stripe = require("stripe");
const {findClientById} = require("../repositories/clientRepository");

let _stripe;
const getStripe = () => {
  if (!_stripe) _stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
};

const stripePaymentMethodSchema = {
  type: "object",
  properties: {
    id: {type: "string"},
    type: {type: "string"},
    brand: {type: "string"},
    last4: {type: "string"},
    exp_month: {type: "integer"},
    exp_year: {type: "integer"},
    cardholder_name: {type: "string"},
    is_default: {type: "boolean"},
  },
};

async function getClientWithStripeId(fastify, client_id, reply) {
  const client = await findClientById(fastify.pg, client_id);
  if (!client) {
    reply.status(404).send({error: {message: "Client not found", statusCode: 404}});
    return null;
  }
  if (!client.stripe_customer_id) {
    reply.status(422).send({
      error: {message: "Client does not have a Stripe customer ID", statusCode: 422},
    });
    return null;
  }
  return client;
}

async function paymentMethodRoutes(fastify) {
  // POST /payment-methods/attach
  fastify.post(
    "/payment-methods/attach",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Attach a payment method to a client",
        description:
          "Accepts a `stripe_payment_method_id` from Stripe.js and attaches it to the client's Stripe customer. Optionally sets it as the subscription default.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["client_id", "stripe_payment_method_id"],
          properties: {
            client_id: {type: "integer"},
            stripe_payment_method_id: {
              type: "string",
              pattern: "^pm_",
              description: "Stripe PaymentMethod ID from Stripe.js (starts with pm_)",
            },
            is_default: {type: "boolean", default: false},
          },
          additionalProperties: false,
        },
        response: {
          200: stripePaymentMethodSchema,
        },
      },
    },
    async (request, reply) => {
      const {client_id, stripe_payment_method_id, is_default = false} = request.body;

      const client = await getClientWithStripeId(fastify, client_id, reply);
      if (!client) return;

      let pm;
      try {
        pm = await getStripe().paymentMethods.attach(stripe_payment_method_id, {
          customer: client.stripe_customer_id,
        });
      } catch (err) {
        if (err.code === "payment_method_already_attached") {
          pm = await getStripe().paymentMethods.retrieve(stripe_payment_method_id);
        } else {
          return reply.status(422).send({
            error: {message: err.message, statusCode: 422, stripeCode: err.code},
          });
        }
      }

      if (is_default) {
        await getStripe().customers.update(client.stripe_customer_id, {
          invoice_settings: {default_payment_method: stripe_payment_method_id},
        });
        if (client.stripe_subscription_id) {
          await getStripe().subscriptions.update(client.stripe_subscription_id, {
            default_payment_method: stripe_payment_method_id,
          });
        }
      }

      return {
        id: pm.id,
        type: pm.type,
        brand: pm.card?.brand || null,
        last4: pm.card?.last4 || null,
        exp_month: pm.card?.exp_month || null,
        exp_year: pm.card?.exp_year || null,
        cardholder_name: pm.billing_details?.name || null,
        is_default,
      };
    },
  );

  // GET /payment-methods/client/:client_id
  fastify.get(
    "/payment-methods/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "List payment methods for a client",
        description: "Fetches all saved payment methods for the client directly from Stripe.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {client_id: {type: "integer"}},
          required: ["client_id"],
        },
        querystring: {
          type: "object",
          properties: {
            type: {
              type: "string",
              default: "card",
              enum: ["card", "us_bank_account", "sepa_debit", "paypal"],
            },
            limit: {type: "integer", minimum: 1, maximum: 100, default: 20},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              stripe_customer_id: {type: "string"},
              payment_methods: {type: "array", items: stripePaymentMethodSchema},
              has_more: {type: "boolean"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const client = await getClientWithStripeId(fastify, request.params.client_id, reply);
      if (!client) return;

      const {type = "card", limit = 20} = request.query;

      const [stripeCustomer, stripeList] = await Promise.all([
        getStripe().customers.retrieve(client.stripe_customer_id),
        getStripe().paymentMethods.list({customer: client.stripe_customer_id, type, limit}),
      ]);

      const defaultPmId = stripeCustomer.invoice_settings?.default_payment_method || null;

      return {
        stripe_customer_id: client.stripe_customer_id,
        payment_methods: stripeList.data.map((pm) => ({
          id: pm.id,
          type: pm.type,
          brand: pm.card?.brand || null,
          last4: pm.card?.last4 || null,
          exp_month: pm.card?.exp_month || null,
          exp_year: pm.card?.exp_year || null,
          cardholder_name: pm.billing_details?.name || null,
          is_default: pm.id === defaultPmId,
        })),
        has_more: stripeList.has_more,
      };
    },
  );

  // POST /payment-methods/:stripe_pm_id/set-default
  fastify.post(
    "/payment-methods/:stripe_pm_id/set-default",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Set a payment method as default",
        description: "Sets the given Stripe payment method as the default for the client's customer and subscription.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {stripe_pm_id: {type: "string"}},
          required: ["stripe_pm_id"],
        },
        body: {
          type: "object",
          required: ["client_id"],
          properties: {
            client_id: {type: "integer"},
          },
          additionalProperties: false,
        },
        response: {200: {type: "object", properties: {success: {type: "boolean"}}}},
      },
    },
    async (request, reply) => {
      const {stripe_pm_id} = request.params;
      const {client_id} = request.body;

      const client = await getClientWithStripeId(fastify, client_id, reply);
      if (!client) return;

      await getStripe().customers.update(client.stripe_customer_id, {
        invoice_settings: {default_payment_method: stripe_pm_id},
      });

      if (client.stripe_subscription_id) {
        await getStripe().subscriptions.update(client.stripe_subscription_id, {
          default_payment_method: stripe_pm_id,
        });
      }

      return {success: true};
    },
  );

  // DELETE /payment-methods/:stripe_pm_id
  fastify.delete(
    "/payment-methods/:stripe_pm_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Payment Methods"],
        summary: "Detach a payment method",
        description: "Detaches the payment method from the Stripe customer.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {stripe_pm_id: {type: "string"}},
          required: ["stripe_pm_id"],
        },
        response: {204: {type: "null"}},
      },
    },
    async (request, reply) => {
      try {
        await getStripe().paymentMethods.detach(request.params.stripe_pm_id);
      } catch (err) {
        if (err.code !== "resource_missing") {
          return reply.status(422).send({
            error: {message: err.message, statusCode: 422, stripeCode: err.code},
          });
        }
      }
      return reply.status(204).send();
    },
  );
}

module.exports = paymentMethodRoutes;

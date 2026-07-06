// User CRUD routes
const {SESv2Client, SendEmailCommand} = require("@aws-sdk/client-sesv2");
const nodemailer = require("nodemailer");
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

const region = process.env.REGION;
const ses = new SESv2Client({region});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: {SendEmailCommand}},
});

const email_from_name = "PBXScribe Support";

const renderRow = (label, value) => `
  <tr>
    <td style="padding-top: 15px;">
      <p style="margin:0; font-family: sans-serif; font-size: 12px; color: #008AA2; letter-spacing: 1px;">${label}</p>
      <p style="margin:5px 0 0 0; font-family: sans-serif; font-size: 16px; font-weight: 600; color: #3A3C47;">${value}</p>
      <div style="border-bottom: 1px dashed #50A2B0; padding-top: 10px;"></div>
    </td>
  </tr>
`;

const generateCustomPlanHtml = ({name, email, phone, organization_name}) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style type="text/css">
      body { height: 100% !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important }
      @media screen and (max-width: 600px) { .wMobile { width: 100% !important; } }
    </style>
  </head>
  <body bgcolor="#d6d6d6" style="background-color: #d6d6d6">
    <table border="0" cellpadding="0" cellspacing="0" style="width: 100%">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" class="wMobile" style="width: 600px; background-color: #ffffff;">
            <tr>
              <td align="center" style="padding: 30px 0;">
                <img src="https://mcusercontent.com/d603034a289f62a1c39e7ae49/images/5eba9c76-ba53-96ad-15eb-73d5b91ee5c8.png" width="190" alt="Logo">
              </td>
            </tr>
            <tr>
              <td bgcolor="#0B263B" style="padding: 10px 30px;">
                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">Custom Plan Request</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                A new custom plan inquiry has been submitted.
              </td>
            </tr>
            <tr>
              <td style="padding: 0 30px 30px 30px;">
                <table width="100%" bgcolor="#F1FBF7" style="border-radius: 20px; padding: 20px;">
                  ${renderRow("NAME", name)}
                  ${renderRow("EMAIL", email)}
                  ${renderRow("PHONE", phone)}
                  ${renderRow("ORGANIZATION", organization_name)}
                </table>
              </td>
            </tr>
            <tr>
              <td bgcolor="#f7f7f7" align="center" style="padding: 10px 0;">
                <a href="http://www.dtsit.com/" style="font-family: sans-serif; font-size: 14px; color: #3A3C47; text-decoration: none;">Digicom Technology Solutions | Your Success. Our Passion.</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
`;

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
  // POST /custom-plan — custom plan inquiry (public)
  fastify.post(
    "/custom-plan",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Subscription Plans"],
        summary: "Request a custom plan",
        description:
          "Submits a custom plan inquiry. Sends a notification email to the support team.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["name", "email", "phone", "organization_name"],
          properties: {
            name: {type: "string", minLength: 1, maxLength: 255},
            email: {type: "string", format: "email"},
            phone: {type: "string", minLength: 7, maxLength: 20},
            organization_name: {type: "string", minLength: 1, maxLength: 255},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: {type: "string"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {name, email, phone, organization_name} = request.body;

      const info = await transporter.sendMail({
        from: `${email_from_name} <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
        to: process.env.TEST_EMAIL,
        subject: `Custom Plan Request from ${organization_name}`,
        html: generateCustomPlanHtml({name, email, phone, organization_name}),
      });

      console.log(`Custom plan inquiry email sent: ${info.messageId}`);

      return {message: "Your custom plan request has been received. We will be in touch shortly."};
    },
  );

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

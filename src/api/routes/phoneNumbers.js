// User CRUD routes
const {
  showPhoneNumbers,
  buyAndAssignPhoneNumber,
  listPhoneNumbers,
  deletePhoneNumber,
} = require("../repositories/phoneNumbersRepository");

const twilioSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    phone_number_sid: {
      type: "string",
    },
    phone_number: {type: "string"},
    phone_type: {type: "string"},
    friendly_name: {type: "string"},
    voice_capabilities: {type: "boolean"},
    sms_capabilities: {type: "boolean"},
    mms_capabilities: {type: "boolean"},
    client_id: {type: "integer"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register Twilio routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function twilioRoutes(fastify) {
  // POST /get-phone-numbers — get available phone numbers for a country
  fastify.post(
    "/show-phone-numbers",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Buy and assign a phone number",
        description:
          "Buys and assigns a phone number for a client. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["country_code"],
          properties: {
            country_code: {type: "string", minLength: 2, maxLength: 2},
            search_type: {
              type: "string",
              enum: ["number", "locality"],
            },
            search_pattern: {
              type: "string",
              enum: ["starts_with", "ends_with", "contains"],
            },
            search_string: {type: "string", minLength: 1, maxLength: 50},
          },
          additionalProperties: false,
        },
        200: {
          type: "object",
          properties: {
            phone_numbers: {
              type: "array",
              items: {
                phone_number: {type: "string"},
                capabilities: {
                  voice: {type: "boolean"},
                  sms: {type: "boolean"},
                  mms: {type: "boolean"},
                },
                friendly_name: {type: "string"},
                phone_type: {type: "string"},
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const {country_code, search_type, search_pattern, search_string} =
          request.body;
        const phoneNumber = await showPhoneNumbers(
          country_code,
          search_string,
          search_type,
          search_pattern,
        );
        console.log("Available phone numbers:", phoneNumber);
        return reply.status(201).send(phoneNumber);
      } catch (error) {
        console.error("Error buying and assigning phone number:", error);
        return reply.status(500).send({
          error: {
            message: "Failed to buy and assign phone number",
            statusCode: 500,
          },
        });
      }
    },
  );

  // POST /buy-phone-number — buy and assign a phone number to a client
  fastify.post(
    "/buy-phone-number",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Buy and assign a phone number to a client",
        description:
          "Buys and assigns a phone number to a client. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "client_id",
            "phone_number",
            "phone_type",
            "friendly_name",
            "voice_capabilities",
            "sms_capabilities",
            "mms_capabilities",
          ],
          properties: {
            client_id: {type: "integer"},
            phone_number: {type: "string"},
            phone_type: {type: "string"},
            friendly_name: {type: "string"},
            voice_capabilities: {type: "boolean"},
            sms_capabilities: {type: "boolean"},
            mms_capabilities: {type: "boolean"},
          },
          additionalProperties: false,
        },
        response: {
          201: twilioSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        client_id,
        phone_number,
        phone_type,
        friendly_name,
        voice_capabilities,
        sms_capabilities,
        mms_capabilities,
      } = request.body;

      try {
        const phone = await buyAndAssignPhoneNumber(fastify.pg, {
          client_id,
          phone_number,
          phone_type,
          friendly_name,
          voice_capabilities,
          sms_capabilities,
          mms_capabilities,
        });

        return reply.status(201).send(phone);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A phone number with this SID already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /phone numbers — list phone numbers
  fastify.get(
    "/phone-numbers/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "List phone numbers",
        description:
          "Returns a paginated list of phone numbers, optionally filtered by status.",
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
              phone_numbers: {type: "array", items: twilioSchema},
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
      const {client_id} = request.params;
      const {phone_numbers, total} = await listPhoneNumbers(
        fastify.pg,
        client_id,
        {
          limit,
          offset,
        },
      );

      return {phone_numbers: phone_numbers || [], total, limit, offset};
    },
  );

  // DELETE /phonenumber/number/:phone_number — delete phone number
  fastify.delete(
    "/phonenumber/number/:phone_number",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Delete a phone number",
        description:
          "Permanently deletes a phone number record by phone number.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            phone_number: {type: "string"},
          },
        },
        response: {
          204: {type: "null"},
        },
      },
    },
    async (request, reply) => {
      const deleted = await deletePhoneNumber(
        fastify.pg,
        request.params.phone_number,
      );

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Phone number not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = twilioRoutes;

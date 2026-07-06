// User CRUD routes
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const {getSignedUrl} = require("@aws-sdk/s3-request-presigner");
const {
  showPhoneNumbers,
  buyAndAssignPhoneNumber,
  listPhoneNumbers,
  findPhoneNumberById,
  findPhoneNumberByNumber,
  updatePhoneNumber,
  associateTwilioFlow,
  deletePhoneNumber,
  addGreetingsFile,
} = require("../repositories/phoneNumbersRepository");
const {
  updateUser,
  findUserByVoicemailNumberId,
} = require("../repositories/userRepository");
const {findClientById} = require("../repositories/clientRepository");

const region = process.env.REGION;
const s3Client = new S3Client({
  region,
  requestChecksumCalculation: "WHEN_REQUIRED",
});

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
    is_associated: {type: "boolean"},
    greetings_file_name: {type: "string"},
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
            country_code: {type: "string", enum: ["US"]},
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
                monthly_price: {type: "string"},
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

  // GET /phonenumber/id/:id — get phone number by ID
  fastify.get(
    "/phonenumber/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Get a phone number",
        description: "Returns a single phone number by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: twilioSchema,
        },
      },
    },
    async (request, reply) => {
      const phoneNumber = await findPhoneNumberById(
        fastify.pg,
        request.params.id,
      );

      if (!phoneNumber) {
        return reply.status(404).send({
          error: {
            message: "Phone number not found",
            statusCode: 404,
          },
        });
      }

      return phoneNumber;
    },
  );

  // GET /phonenumber/greeting/id/:id — get greeting file name for a phone number by ID
  fastify.get(
    "/phonenumber/greeting/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Get greeting file name for a phone number",
        description:
          "Returns the greeting file name for a phone number by ID. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              greetings_url: {type: "string"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const phone_number = await findPhoneNumberById(
        fastify.pg,
        request.params.id,
      );
      if (!phone_number) {
        return reply.status(404).send({
          error: {
            message: "Phone number not found",
            statusCode: 404,
          },
        });
      }

      if (!phone_number.greetings_file_name) {
        return reply.status(404).send({
          error: {
            message: "Greetings file not found",
            statusCode: 404,
          },
        });
      }

      try {
        const command = new GetObjectCommand({
          Bucket: process.env.GREETINGS_S3_BUCKET,
          Key: phone_number.greetings_file_name,
        });
        const greetings_url = await getSignedUrl(s3Client, command, {
          expiresIn: 3600,
        });
        console.log("Generated presigned URL:", greetings_url);

        return reply.status(201).send({
          greetings_url,
        });
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

  // PUT /phonenumber/greeting/id/:id — update phone number with greetings file
  fastify.put(
    "/phonenumber/greeting/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Update greetings file for a phone number",
        description:
          "Updates the greetings file for a phone number. Requires authentication.",
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
            client_id: {type: "integer"},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: {
            type: "object",
            properties: {
              greetings_upload_url: {type: "string"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {client_id} = request.body;

      const client = await findClientById(fastify.pg, client_id);
      if (!client) {
        return reply.status(404).send({
          error: {
            message: "Client not found",
            statusCode: 404,
          },
        });
      }

      const phone_number = await findPhoneNumberById(
        fastify.pg,
        request.params.id,
      );
      if (!phone_number) {
        return reply.status(404).send({
          error: {
            message: "Phone number not found",
            statusCode: 404,
          },
        });
      }

      console.log(
        `Phone number found for greetings update: ${JSON.stringify(phone_number)}`,
      );

      const formatted_client_name = client.client_name
        .replace(/\s+/g, "_")
        .toLowerCase();
      const formatted_phone_number = phone_number.phone_number.replace(
        "+1",
        "",
      );

      try {
        const greetings_upload = await addGreetingsFile({
          twilio_phonenumber: phone_number.phone_number,
          mailbox_email: client.client_email,
          client_name: formatted_client_name,
        });

        console.log("Greetings file added:", greetings_upload);

        const command = new PutObjectCommand({
          Bucket: process.env.GREETINGS_S3_BUCKET,
          Key: `${formatted_phone_number}.mp3`,
          ContentType: "audio/mpeg",
        });
        const greetings_upload_url = await getSignedUrl(s3Client, command, {
          expiresIn: 3600,
          signableHeaders: new Set(["content-type"]),
        });
        console.log("Generated presigned URL:", greetings_upload_url);

        const phoneNumber = await updatePhoneNumber(
          fastify.pg,
          request.params.id,
          {greetings_file_name: `${formatted_phone_number}.mp3`},
        );

        return reply.status(201).send({
          greetings_upload_url,
        });
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

  // PUT /phonenumbers/id/:id — update phone number
  fastify.put(
    "/phonenumber/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Phone Numbers"],
        summary: "Associate or disassociate a phone number with a user",
        description:
          "Associate or disassociate a phone number with a user by phone number ID.",
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
            is_associated: {type: "boolean"},
            user_id: {type: "integer"},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: twilioSchema,
        },
      },
    },
    async (request, reply) => {
      const {user_id, is_associated} = request.body;

      const phone = await findPhoneNumberById(fastify.pg, request.params.id);
      if (!phone) {
        return reply.status(404).send({
          error: {
            message: "Phone number not found",
            statusCode: 404,
          },
        });
      }
      console.log("Phone number found:", JSON.stringify(phone));

      const user = await updateUser(fastify.pg, user_id, {
        voicemail_number_id: is_associated === true ? phone.id : null,
      });

      if (is_associated === true) {
        console.log(
          `Associating Twilio Flow for user_id ${user_id} with phone_number_sid ${phone.phone_number_sid}`,
        );
        await associateTwilioFlow(phone.phone_number_sid);
      }

      const phoneNumber = await updatePhoneNumber(
        fastify.pg,
        request.params.id,
        {is_associated: is_associated},
      );

      return phoneNumber;
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
      const voicemailNumber = await findPhoneNumberByNumber(
        fastify.pg,
        request.params.phone_number,
      );

      console.log(
        "Voicemail number found for deletion:",
        JSON.stringify(voicemailNumber),
      );

      if (voicemailNumber.hasOwnProperty("id") && voicemailNumber.id) {
        const user = await findUserByVoicemailNumberId(
          fastify.pg,
          voicemailNumber.id,
        );

        console.log(
          "User found with voicemail number for deletion:",
          JSON.stringify(user),
        );

        if (user && user.id) {
          const updatedUser = await updateUser(fastify.pg, user.id, {
            voicemail_number_id: null,
          });

          console.log(
            `Updated user ${user.id} to disassociate voicemail number:`,
            JSON.stringify(updatedUser),
          );
        }
      }

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

// User CRUD routes
const sesClientModule = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");
const {
  createSupportTicket,
  findSupportTicketById,
  updateSupportTicket,
  listSupportTickets,
  deleteSupportTicket,
} = require("../repositories/supportTicketRepository");
const {findClientById} = require("../repositories/clientRepository");

const region = process.env.REGION;
const ses = new sesClientModule.SESClient({
  region,
});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: sesClientModule},
});

const email_from_name = "PBXScribe Support";
const generateHtmlClient = (supportTicket, bodyIntro, title) => {
  const {case_title, case_description, case_status} = supportTicket;
  const styles = `
    body { height: 100% !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important }
    .wColor { color: #FFFFFF !important; }
    .bColor { color: #3A3C47 !important; }
    @media screen and (max-width: 600px) {
        .wMobile { width: 100% !important; }
        .wInner { width: 90% !important; }
        .H20 { height: 20px !important; line-height: 20px !important; }
    }
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style type="text/css">${styles}</style>
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
                                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">${title}</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                                ${bodyIntro}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 30px 30px 30px;">
                                <table width="100%" bgcolor="#F1FBF7" style="border-radius: 20px; padding: 20px;">
                                    ${renderRow("CASE TITLE", case_title)}
                                    ${renderRow("CASE DESCRIPTION", case_description)}
                                    ${renderRow("STATUS", case_status)}
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
};

const generateHtmlSupport = (supportTicket, bodyIntro, title, client) => {
  console.log("Client:", JSON.stringify(client));
  const {case_title, case_description, case_status} = supportTicket;
  const styles = `
    body { height: 100% !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important }
    .wColor { color: #FFFFFF !important; }
    .bColor { color: #3A3C47 !important; }
    @media screen and (max-width: 600px) {
        .wMobile { width: 100% !important; }
        .wInner { width: 90% !important; }
        .H20 { height: 20px !important; line-height: 20px !important; }
    }
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style type="text/css">${styles}</style>
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
                                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">${title}</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                                ${bodyIntro}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 30px 30px 30px;">
                                <table width="100%" bgcolor="#F1FBF7" style="border-radius: 20px; padding: 20px;">
									${renderRow("CLIENT NAME", client.client_name)}
									${renderRow("CLIENT EMAIL", client.client_email)}    
									${renderRow("CLIENT ADDRESS", client.client_address)}   
									${renderRow("CLIENT PHONE NUMBER", client.client_phone)}                                  
									${renderRow("CASE TITLE", case_title)}
                                    ${renderRow("CASE DESCRIPTION", case_description)}
                                    ${renderRow("STATUS", case_status)}
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
};

const renderRow = (label, value) => `
    <tr>
        <td style="padding-top: 15px;">
            <p style="margin:0; font-family: sans-serif; font-size: 12px; color: #008AA2; letter-spacing: 1px;">${label}</p>
            <p style="margin:5px 0 0 0; font-family: sans-serif; font-size: 16px; font-weight: 600; color: #3A3C47;">${value}</p>
            <div style="border-bottom: 1px dashed #50A2B0; padding-top: 10px;"></div>
        </td>
    </tr>
`;

const supportTicketSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    case_title: {type: "string"},
    case_description: {type: "string"},
    case_status: {type: "string", enum: ["open", "in_progress", "closed"]},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register support ticket CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function supportTicketRoutes(fastify) {
  // POST /support-tickets — create support ticket
  fastify.post(
    "/support-tickets",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Create a support ticket",
        description: "Creates a new support ticket. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "client_id",
            "case_title",
            "case_description",
            "case_status",
          ],
          properties: {
            client_id: {type: "integer"},
            case_title: {type: "string"},
            case_description: {type: "string"},
            case_status: {
              type: "string",
              enum: ["open", "in_progress", "closed"],
            },
          },
          additionalProperties: false,
        },
        response: {
          201: supportTicketSchema,
        },
      },
    },
    async (request, reply) => {
      const {client_id, case_title, case_description, case_status} =
        request.body;

      try {
        const client = await findClientById(fastify.pg, client_id);
        if (!client) {
          return reply.status(404).send({
            error: {
              message: "Client not found",
              statusCode: 404,
            },
          });
        }

        const supportTicket = await createSupportTicket(fastify.pg, {
          client_id,
          case_title,
          case_description,
          case_status,
        });

        // Email to support team
        const supportInfo = await transporter.sendMail({
          from: `${email_from_name} <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
          //to: process.env.DEFAULT_TO_EMAIL,
          to: process.env.TEST_EMAIL,
          subject: `Support ticket created for ${client.client_name} | Case ID: ${supportTicket.id}`,
          html: generateHtmlSupport(
            supportTicket,
            "A new support ticket has been created.",
            "Support Ticket Created",
            client,
          ),
        });

        // Email to client
        const clientInfo = await transporter.sendMail({
          from: `${email_from_name} <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
          //to: client.email,
          to: process.env.TEST_EMAIL,
          subject: `Support ticket created | Case ID: ${supportTicket.id}`,
          html: generateHtmlClient(
            supportTicket,
            `Hi, ${client.client_name}<br /><br />Your support ticket has been created.`,
            "Support Ticket Created",
          ),
        });

        console.log(`Email sent to support team: ${supportInfo.messageId}`);
        console.log(`Email sent to client: ${clientInfo.messageId}`);

        return reply.status(201).send(supportTicket);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A support ticket with this title already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /support-tickets/client/:client_id — list support tickets for a client
  fastify.get(
    "/support-tickets/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "List support tickets for a client",
        description:
          "Returns a paginated list of support tickets for a specific client, optionally filtered by status.",
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
            status: {type: "string", enum: ["open", "in_progress", "closed"]},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              supportTickets: {type: "array", items: supportTicketSchema},
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
      const {supportTickets, total} = await listSupportTickets(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
          status,
        },
      );

      return {supportTickets, total, limit, offset};
    },
  );

  // GET /support-tickets/:id — get support ticket by ID
  fastify.get(
    "/support-tickets/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Get a support ticket",
        description: "Returns a single support ticket by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: supportTicketSchema,
        },
      },
    },
    async (request, reply) => {
      const supportTicket = await findSupportTicketById(
        fastify.pg,
        request.params.id,
      );

      if (!supportTicket) {
        return reply.status(404).send({
          error: {
            message: "Support ticket not found",
            statusCode: 404,
          },
        });
      }

      return supportTicket;
    },
  );

  // PUT /support-tickets/:id — update support ticket
  fastify.put(
    "/support-tickets/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Update a support ticket",
        description: "Updates the details of an existing support ticket.",
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
            case_title: {type: "string", minLength: 1, maxLength: 255},
            case_description: {type: "string", minLength: 1, maxLength: 255},
            case_status: {
              type: "string",
              enum: ["open", "in_progress", "closed"],
            },
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: supportTicketSchema,
        },
      },
    },
    async (request, reply) => {
      const supportTicket = await updateSupportTicket(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!supportTicket) {
        return reply.status(404).send({
          error: {
            message: "Support ticket not found",
            statusCode: 404,
          },
        });
      }

      return supportTicket;
    },
  );

  // DELETE /support-tickets/:id — delete support ticket
  fastify.delete(
    "/support-tickets/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Support Tickets"],
        summary: "Delete a support ticket",
        description: "Permanently deletes a support ticket record by ID.",
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
      const deleted = await deleteSupportTicket(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Support ticket not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = supportTicketRoutes;

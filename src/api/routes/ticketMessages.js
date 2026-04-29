// User CRUD routes
const sesClientModule = require("@aws-sdk/client-ses");
const nodemailer = require("nodemailer");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const {getSignedUrl} = require("@aws-sdk/s3-request-presigner");
const {
  createTicketMessage,
  findTicketMessageById,
  updateTicketMessage,
  listTicketMessages,
  deleteTicketMessage,
} = require("../repositories/ticketMessageRepository");
const {findClientById} = require("../repositories/clientRepository");
const {
  findSupportTicketById,
} = require("../repositories/supportTicketRepository");

const region = process.env.REGION;
const ses = new sesClientModule.SESClient({
  region,
});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: sesClientModule},
});
const s3Client = new S3Client({
  region,
  requestChecksumCalculation: "WHEN_REQUIRED",
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

const ticketMessageSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    ticket_id: {type: "integer"},
    message_content: {type: "string"},
    message_timestamp: {type: "string", format: "date-time"},
    attachment_filename: {type: "string"},
    attachment_contenttype: {type: "string"},
    attachment_upload_url: {type: "string"},
    attachment_url: {type: "string"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register ticket message CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function ticketMessageRoutes(fastify) {
  // POST /ticket-messages — create ticket message
  fastify.post(
    "/ticket-messages",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Create a ticket message",
        description: "Creates a new ticket message. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["ticket_id", "message_content", "message_timestamp"],
          properties: {
            ticket_id: {type: "integer"},
            message_content: {type: "string"},
            message_timestamp: {type: "string", format: "date-time"},
            attachment_filename: {type: "string"},
            attachment_contenttype: {type: "string"},
          },
          additionalProperties: false,
        },
        response: {
          201: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        ticket_id,
        message_content,
        message_timestamp,
        attachment_filename,
        attachment_contenttype,
      } = request.body;

      console.log(
        "Creating ticket message with content type:",
        attachment_contenttype,
      );
      console.log(
        "Creating ticket message with filename:",
        attachment_filename,
      );

      const command = new PutObjectCommand({
        Bucket: process.env.ATTACHMENTS_S3_BUCKET,
        Key: `support_attachments/${attachment_filename}`,
        ContentType: attachment_contenttype,
      });
      const attachment_upload_url = await getSignedUrl(s3Client, command, {
        expiresIn: 300,
        signableHeaders: new Set(["content-type"]),
      });
      console.log("Generated presigned URL:", attachment_upload_url);

      try {
        const ticketMessage = await createTicketMessage(fastify.pg, {
          ticket_id,
          message_content,
          message_timestamp,
          attachment_filename,
          attachment_contenttype,
          attachment_upload_url,
        });
        console.log("Created ticket message:", JSON.stringify(ticketMessage));
        const supportTicket = await findSupportTicketById(
          fastify.pg,
          ticket_id,
        );
        const client = await findClientById(
          fastify.pg,
          supportTicket.client_id,
        );
        if (!client) {
          return reply.status(404).send({
            error: {
              message: "Client not found",
              statusCode: 404,
            },
          });
        }

        console.log("Ticket Message:", JSON.stringify(ticketMessage));
        console.log("Support Ticket:", JSON.stringify(supportTicket));

        // Email to support team
        const supportInfo = await transporter.sendMail({
          from: `${email_from_name} <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
          //to: process.env.DEFAULT_TO_EMAIL,
          to: process.env.TEST_EMAIL,
          subject: `A new message added for ${client.client_name} | Case ID: ${supportTicket.id}`,
          html: generateHtmlSupport(
            supportTicket,
            "A new message has been added to the support ticket.",
            `Message Added to Case ID: ${supportTicket.id}`,
            client,
          ),
        });

        // Email to client
        const clientInfo = await transporter.sendMail({
          from: `${email_from_name} <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
          //to: client.email,
          to: process.env.TEST_EMAIL,
          subject: `A new message added | Case ID: ${supportTicket.id}`,
          html: generateHtmlClient(
            supportTicket,
            `Hi, ${client.client_name}<br /><br />We received your message and will get back to you shortly.`,
            `Message Added to Case ID: ${supportTicket.id}`,
          ),
        });

        console.log(`Email sent to support team: ${supportInfo.messageId}`);
        console.log(`Email sent to client: ${clientInfo.messageId}`);

        return reply.status(201).send(ticketMessage);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A ticket message with this content already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /ticket-messages/ticket/:ticket_id — list ticket messages for a ticket
  fastify.get(
    "/ticket-messages/ticket/:ticket_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "List ticket messages for a ticket",
        description:
          "Returns a paginated list of ticket messages for a specific ticket, optionally filtered by status.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            ticket_id: {type: "integer"},
          },
          required: ["ticket_id"],
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
              ticketMessages: {type: "array", items: ticketMessageSchema},
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
      const {ticketMessages, total} = await listTicketMessages(
        fastify.pg,
        request.params.ticket_id,
        {
          limit,
          offset,
        },
      );

      return {ticketMessages, total, limit, offset};
    },
  );

  // GET /ticket-messages/:id — get ticket message by ID
  fastify.get(
    "/ticket-messages/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Get a ticket message",
        description: "Returns a single ticket message by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const ticketMessage = await findTicketMessageById(
        fastify.pg,
        request.params.id,
      );

      if (!ticketMessage) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      return ticketMessage;
    },
  );

  // GET /ticket-messages/attachment/message/:id — get ticket message by ID
  fastify.get(
    "/ticket-messages/attachment/message/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Get the presigned URL for a ticket message attachment",
        description:
          "Returns a presigned URL for a single ticket message attachment by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const ticketMessage = await findTicketMessageById(
        fastify.pg,
        request.params.id,
      );

      if (!ticketMessage) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      const {attachment_filename, attachment_contenttype} = ticketMessage;

      if (!attachment_filename || !attachment_contenttype) {
        return reply.status(404).send({
          error: {
            message: "Ticket message attachment not found",
            statusCode: 404,
          },
        });
      }

      const command = new GetObjectCommand({
        Bucket: process.env.ATTACHMENTS_S3_BUCKET,
        Key: `support_attachments/${attachment_filename}`,
      });

      const imageURL = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      return {...ticketMessage, attachment_url: imageURL};
    },
  );

  // PUT /ticket-messages/:id — update ticket message
  fastify.put(
    "/ticket-messages/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Update a ticket message",
        description: "Updates the details of an existing ticket message.",
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
            message_content: {type: "string", minLength: 1, maxLength: 255},
            message_timestamp: {
              type: "string",
              format: "date-time",
            },
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: ticketMessageSchema,
        },
      },
    },
    async (request, reply) => {
      const ticketMessage = await updateTicketMessage(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!ticketMessage) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      return ticketMessage;
    },
  );

  // DELETE /ticket-messages/:id — delete ticket message
  fastify.delete(
    "/ticket-messages/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Ticket Messages"],
        summary: "Delete a ticket message",
        description: "Permanently deletes a ticket message record by ID.",
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
      const deleted = await deleteTicketMessage(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Ticket message not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = ticketMessageRoutes;

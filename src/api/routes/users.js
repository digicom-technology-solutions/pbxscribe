// User CRUD routes
const {SESv2Client, SendEmailCommand} = require("@aws-sdk/client-sesv2");
const nodemailer = require("nodemailer");

const {
  createUser,
  findUserById,
  findUserByEmail,
  updateUser,
  listUsers,
  deleteUser,
} = require("../repositories/userRepository");
const {createCredential} = require("../repositories/credentialRepository");
const {hashPassword, checkPasswordStrength} = require("../utils/password");
const {generateToken} = require("../utils/jwt");
const {
  requestPasswordReset,
} = require("../repositories/passwordResetRepository");

const ses = new SESv2Client({region: process.env.REGION});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: {SendEmailCommand}},
});

const userSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    client_id: {type: "integer"},
    email: {type: "string", format: "email"},
    pbx_email: {type: "string", format: "email"},
    firstname: {type: "string"},
    lastname: {type: "string"},
    phone: {type: "string"},
    voicemail_number_id: {type: "integer"},
    sms_notification: {type: "boolean"},
    timezone: {
      type: "string",
      enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
    },
    user_type: {type: "string", enum: ["console", "api"]},
    user_role: {
      type: "string",
      enum: [
        "owner",
        "manager",
        "viewer",
        "superadmin",
        "developer",
        "support",
        "admin",
      ],
    },
    user_status: {type: "string", enum: ["enabled", "disabled"]},
    two_fa_enabled: {type: "boolean"},
    two_fa_secret: {type: "string"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

const generatePasswordSetHtml = (firstname, setUrl) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style type="text/css">
      body { height: 100% !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important; }
      @media screen and (max-width: 600px) { .wMobile { width: 100% !important; } }
    </style>
  </head>
  <body bgcolor="#d6d6d6" style="background-color: #d6d6d6;">
    <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" class="wMobile" style="width: 600px; background-color: #ffffff;">
            <tr>
              <td align="center" style="padding: 30px 0;">
                <img src="https://mcusercontent.com/d603034a289f62a1c39e7ae49/images/5eba9c76-ba53-96ad-15eb-73d5b91ee5c8.png" width="190" alt="PBXScribe">
              </td>
            </tr>
            <tr>
              <td bgcolor="#0B263B" style="padding: 10px 30px;">
                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">Set Password</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 30px 30px 10px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                Hi ${firstname},<br><br>
                Your PBXScribe account has been created. Click the button below to set your password and get started. This link expires in <strong>1 hour</strong>.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 30px;">
                <a href="${setUrl}" style="display: inline-block; background-color: #008AA2; color: #FFFFFF; font-family: sans-serif; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 6px;">Set Password</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 30px 30px 30px; font-family: sans-serif; font-size: 14px; color: #3A3C47; line-height: 22px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${setUrl}" style="color: #008AA2; word-break: break-all;">${setUrl}</a>
                <br><br>
                If you did not expect this email, you can safely ignore it. Your account will remain inactive until a password is set.
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

/**
 * Register user CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function userRoutes(fastify) {
  // POST /users — create user
  fastify.post(
    "/users",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "Create a user",
        description: "Creates a new user record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["client_id", "email", "firstname", "lastname", "password"],
          properties: {
            client_id: {type: "integer"},
            email: {type: "string", format: "email"},
            firstname: {type: "string", minLength: 1, maxLength: 255},
            lastname: {type: "string", minLength: 1, maxLength: 255},
            password: {type: "string", minLength: 8, maxLength: 255},
            phone: {type: "string", minLength: 10, maxLength: 15},
            voicemail_number_id: {type: "integer"},
            sms_notification: {type: "boolean"},
            timezone: {
              type: "string",
              enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
            },
            user_type: {
              type: "string",
              enum: ["console", "api"],
            },
            user_status: {
              type: "string",
              enum: ["enabled", "disabled"],
            },
            user_role: {
              type: "string",
              enum: [
                "owner",
                "manager",
                "viewer",
                "superadmin",
                "developer",
                "support",
                "admin",
              ],
            },
            two_fa_enabled: {type: "boolean"},
          },
          additionalProperties: false,
        },
        response: {
          201: userSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        client_id,
        email,
        firstname,
        lastname,
        password,
        phone,
        sms_notification,
        timezone,
        user_type,
        user_status,
        two_fa_enabled,
      } = request.body;
      let {user_role} = request.body;

      const {valid, failures} = checkPasswordStrength(password);
      if (!valid) {
        return reply.status(422).send({
          error: {
            message: `Password too weak: ${failures.join(", ")}`,
            statusCode: 422,
          },
        });
      }

      try {
        const pbx_email =
          email.split("@")[0] +
          email.split("@")[1].split(".")[0] +
          "@" +
          process.env.PBXSCRIBE_DOMAIN;

        const existingUsers = await listUsers(fastify.pg, client_id);
        if (existingUsers.total === 0) user_role = "owner"; // If no users exist for the client, make the first user the owner

        const user = await createUser(fastify.pg, {
          client_id,
          email,
          pbx_email,
          firstname,
          lastname,
          phone: phone || null,
          voicemail_number_id: null,
          sms_notification: sms_notification || false,
          timezone: timezone || "UTC",
          user_type: user_type || "console",
          user_role: user_role || "viewer",
          user_status: user_status || "enabled",
          two_fa_enabled: two_fa_enabled || false,
        });

        const hash = await hashPassword(password);
        await createCredential(fastify.pg, {
          userId: user.id,
          credentialType: "password",
          credentialHash: hash,
          label: "password",
        });

        return reply.status(201).send(user);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A user with this email already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // POST /users/invite — invite user
  fastify.post(
    "/users/invite",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "Invite a user",
        description:
          "Invites a new user to the system. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: [
            "client_id",
            "email",
            "firstname",
            "lastname",
            "user_role",
          ],
          properties: {
            client_id: {type: "integer"},
            email: {type: "string", format: "email"},
            firstname: {type: "string", minLength: 1, maxLength: 255},
            lastname: {type: "string", minLength: 1, maxLength: 255},
            user_role: {
              type: "string",
              enum: [
                "owner",
                "manager",
                "viewer",
                "developer",
                "support",
                "admin",
              ],
            },
          },
          additionalProperties: false,
        },
        response: {
          201: userSchema,
        },
      },
    },
    async (request, reply) => {
      const {client_id, email, firstname, lastname, user_role} = request.body;

      try {
        const pbx_email =
          email.split("@")[0] +
          email.split("@")[1].split(".")[0] +
          "@" +
          process.env.PBXSCRIBE_DOMAIN;

        const existingUsers = await listUsers(fastify.pg, client_id);

        const user = await createUser(fastify.pg, {
          client_id,
          email,
          pbx_email,
          firstname,
          lastname,
          phone: null,
          voicemail_number_id: null,
          sms_notification: false,
          timezone: "UTC",
          user_type: "console",
          user_role: user_role || "viewer",
          user_status: "enabled",
          two_fa_enabled: false,
        });

        const token = generateToken({
          sub: user.id,
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
        });

        const createdAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

        await requestPasswordReset(fastify.pg, {
          email: email,
          user_id: user.id,
          client_id: user.client_id,
          token: token,
          expires_at: expiresAt,
          created_at: createdAt,
        });

        const setUrl = `https://${process.env.PBXSCRIBE_DOMAIN}/set-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        const info = await transporter.sendMail({
          from: `PBXScribe Support <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
          to: email,
          subject: "Set your PBXScribe password",
          html: generatePasswordSetHtml(user.firstname, setUrl),
        });
        console.log(`Password set email sent: ${info.messageId}`);

        return reply.status(201).send(user);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A user with this email already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /users — list users
  fastify.get(
    "/users/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "List users",
        description:
          "Returns a paginated list of users, optionally filtered by status.",
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
            status: {type: "string", enum: ["enabled", "disabled"]},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              users: {type: "array", items: userSchema},
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
      const {users, total} = await listUsers(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
          status,
        },
      );

      return {users, total, limit, offset};
    },
  );

  // GET /users/:id — get user by ID
  fastify.get(
    "/users/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "Get a user",
        description: "Returns a single user by UUID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: userSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await findUserById(fastify.pg, request.params.id);

      if (!user) {
        return reply.status(404).send({
          error: {
            message: "User not found",
            statusCode: 404,
          },
        });
      }

      return user;
    },
  );

  // GET /users/:email — get user by email
  fastify.get(
    "/users/email/:email",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "Get a user",
        description: "Returns a single user by email.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            email: {type: "string", format: "email"},
          },
          required: ["email"],
        },
        response: {
          200: userSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await findUserByEmail(fastify.pg, request.params.email);

      if (!user) {
        return reply.status(404).send({
          error: {
            message: "User not found",
            statusCode: 404,
          },
        });
      }

      return user;
    },
  );

  // PUT /users/:id — update user
  fastify.put(
    "/users/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "Update a user",
        description:
          "Updates first name, last name, phone, sms notification preference, timezone, user_role, 2fa and/or user_status of an existing user.",
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
            firstname: {type: "string", minLength: 1, maxLength: 255},
            lastname: {type: "string", minLength: 1, maxLength: 255},
            phone: {type: "string", minLength: 10, maxLength: 15},
            voicemail_number_id: {type: "integer"},
            sms_notification: {type: "boolean"},
            password: {type: "string", minLength: 8, maxLength: 255},
            timezone: {
              type: "string",
              enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
            },
            user_role: {
              type: "string",
              enum: [
                "owner",
                "manager",
                "viewer",
                "superadmin",
                "developer",
                "support",
                "admin",
              ],
            },
            two_fa_enabled: {type: "boolean"},
            user_status: {
              type: "string",
              enum: ["enabled", "disabled"],
            },
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: userSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await updateUser(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!user) {
        return reply.status(404).send({
          error: {
            message: "User not found",
            statusCode: 404,
          },
        });
      }

      return user;
    },
  );

  // DELETE /users/:id — delete user
  fastify.delete(
    "/users/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Users"],
        summary: "Delete a user",
        description: "Permanently deletes a user record by UUID.",
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
      const deleted = await deleteUser(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "User not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = userRoutes;

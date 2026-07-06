// Auth routes
const {SESv2Client, SendEmailCommand} = require("@aws-sdk/client-sesv2");
const nodemailer = require("nodemailer");

const ses = new SESv2Client({region: process.env.REGION});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: {SendEmailCommand}},
});

const generatePasswordResetHtml = (firstname, resetUrl) => `
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
                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">Password Reset Request</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 30px 30px 10px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                Hi ${firstname},<br><br>
                We received a request to reset your PBXScribe password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 30px;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #008AA2; color: #FFFFFF; font-family: sans-serif; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 36px; border-radius: 6px;">Reset Password</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 30px 30px 30px; font-family: sans-serif; font-size: 14px; color: #3A3C47; line-height: 22px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #008AA2; word-break: break-all;">${resetUrl}</a>
                <br><br>
                If you didn't request a password reset, you can safely ignore this email. Your password will not change.
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

const {
  createUser,
  findUserByEmail,
  updateUser,
} = require("../repositories/userRepository");
const {
  createCredential,
  findCredentialsByUserId,
  updateLastUsed,
  deactivateCredential,
} = require("../repositories/credentialRepository");
const {
  requestPasswordReset,
  findTokenByEmail,
  deleteToken,
} = require("../repositories/passwordResetRepository");
const {
  createTwoFA,
  sendText,
  sendEmail,
  twoFASetup,
  twoFAVerify,
} = require("../repositories/twoFARepository");
const {
  hashPassword,
  verifyPassword,
  checkPasswordStrength,
} = require("../utils/password");
const {generateToken} = require("../utils/jwt");

/**
 * Register auth routes
 * @param {FastifyInstance} fastify
 */
async function authRoutes(fastify) {
  // POST /auth/register
  fastify.post(
    "/auth/register",
    {
      schema: {
        tags: ["Auth"],
        summary: "Register a new user",
        description:
          "Creates a new user account. If a password is supplied, a JWT token is returned immediately.",
        body: {
          type: "object",
          required: ["email", "firstname", "lastname", "password"],
          properties: {
            email: {type: "string", format: "email"},
            client_id: {type: "integer"},
            firstname: {type: "string", minLength: 1, maxLength: 255},
            lastname: {type: "string", minLength: 1, maxLength: 255},
            password: {type: "string", minLength: 8},
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  email: {type: "string", format: "email"},
                  firstname: {type: "string"},
                  lastname: {type: "string"},
                  phone: {type: "string", minLength: 10, maxLength: 15},
                  sms_notification: {type: "boolean"},
                  timezone: {type: "string", minLength: 1, maxLength: 50},
                  user_type: {type: "string", enum: ["console", "api"]},
                  user_status: {
                    type: "string",
                    enum: ["enabled", "disabled"],
                  },
                  user_role: {
                    type: "string",
                    enum: ["owner", "admin"],
                  },
                  two_fa_enabled: {type: "boolean"},
                  created_at: {type: "string", format: "date-time"},
                  updated_at: {type: "string", format: "date-time"},
                },
              },
              token: {type: "string", description: "JWT token"},
            },
          },
          409: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
          422: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {client_id, email, firstname, lastname, password} = request.body;
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

      let user;
      try {
        const pbx_email =
          email.split("@")[0] +
          email.split("@")[1].split(".")[0] +
          "@" +
          process.env.PBXSCRIBE_DOMAIN;
        user = await createUser(fastify.pg, {
          email,
          pbx_email,
          firstname,
          lastname,
          phone: null,
          sms_notification: false,
          timezone: "UTC",
          user_type: "api",
          user_status: "enabled",
          user_role: "admin",
          two_fa_enabled: false,
          client_id,
        });
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

      const hash = await hashPassword(password);
      await createCredential(fastify.pg, {
        userId: user.id,
        credentialType: "password",
        credentialHash: hash,
        label: "password",
      });

      const token = generateToken({
        sub: user.id,
        email: user.email,
        name: `${user.firstname} ${user.lastname}`,
      });
      return reply.status(201).send({user, token});
    },
  );

  // POST /auth/login
  fastify.post(
    "/auth/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Login with email and password",
        description: "Authenticates a user and returns a signed JWT token.",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {type: "string", format: "email"},
            password: {type: "string"},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: {type: "string", description: "JWT bearer token"},
              user: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  email: {type: "string", format: "email"},
                  firstname: {type: "string"},
                  lastname: {type: "string"},
                  phone: {type: "string", minLength: 10, maxLength: 15},
                  sms_notification: {type: "boolean"},
                  timezone: {type: "string", minLength: 1, maxLength: 50},
                  user_type: {type: "string", enum: ["console", "api"]},
                  user_status: {
                    type: "string",
                    enum: ["enabled", "disabled"],
                  },
                  user_role: {
                    type: "string",
                    enum: ["viewer", "manager", "admin"],
                  },
                  two_fa_enabled: {type: "boolean"},
                  created_at: {type: "string", format: "date-time"},
                  updated_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email, password} = request.body;
      const genericError = {
        error: {message: "Invalid credentials", statusCode: 401},
      };

      const user = await findUserByEmail(fastify.pg, email);
      if (!user || user.user_status !== "enabled") {
        return reply.status(401).send(genericError);
      }

      const credentials = await findCredentialsByUserId(
        fastify.pg,
        user.id,
        "password",
      );
      const active = credentials.filter((c) => c.is_active);

      let matchedCredential = null;
      for (const cred of active) {
        const row = await fastify.pg.query(
          "SELECT credential_hash FROM user_credentials WHERE id = $1",
          [cred.id],
        );
        console.log(
          `Checking password for credential ID ${cred.id}:`,
          row.rows[0],
        );
        const match = row.rows.length
          ? await verifyPassword(password, row.rows[0].credential_hash)
          : false;
        if (match) {
          matchedCredential = cred;
          break;
        }
      }

      if (!matchedCredential) {
        return reply.status(401).send(genericError);
      }

      updateLastUsed(fastify.pg, matchedCredential.id).catch(() => {});

      const token = generateToken({
        sub: user.id,
        email: user.email,
        name: `${user.firstname} ${user.lastname}`,
      });
      return {token, user};
    },
  );

  // POST /auth/two-fa/send-code - protected
  fastify.post(
    "/auth/two-fa/send-code",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Auth"],
        summary: "Send 2FA code",
        description: "Sends a 2FA code to the user's email or phone.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: {type: "string", format: "email"},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              two_fa: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  user_id: {type: "integer"},
                  two_fa: {type: "string"},
                  email: {type: "string", format: "email"},
                  phone: {type: "string", minLength: 10, maxLength: 15},
                  created_at: {type: "string", format: "date-time"},
                  updated_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email} = request.body;
      const genericError = {
        error: {message: "Invalid credentials", statusCode: 401},
      };

      const user = await findUserByEmail(fastify.pg, email);
      if (!user || user.user_status !== "enabled") {
        return reply.status(401).send(genericError);
      }

      const twoFAEntry = await createTwoFA(fastify.pg, {
        client_id: user.client_id,
        user_id: user.id,
        phone: user.phone,
        email: user.email,
      });
      console.log("Created 2FA entry:", twoFAEntry);

      try {
        if (user.phone) {
          await sendText(twoFAEntry.two_fa, user.phone);
        }

        await sendEmail(twoFAEntry.two_fa, user.email);
      } catch (error) {
        console.error(
          "Error sending 2FA code via SMS or email:",
          error.message,
        );
        return reply.status(500).send({
          error: {
            message: "Failed to send 2FA code via SMS or email",
            statusCode: 500,
          },
        });
      }

      try {
        await sendEmail(twoFAEntry.two_fa, user.email);
      } catch (error) {
        console.error("Error sending 2FA code via email:", error.message);
      }

      return {two_fa: twoFAEntry};
    },
  );

  // POST /auth/two-fa/setup - protected
  fastify.post(
    "/auth/two-fa/setup",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Auth"],
        summary: "Set up 2FA",
        description: "Sets up a new 2FA secret and QR code for the user.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: {type: "string", format: "email"},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              two_fa: {
                type: "object",
                properties: {
                  secret: {type: "string"},
                  qrCodeUrl: {type: "string", format: "uri"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email} = request.body;
      const genericError = {
        error: {message: "Invalid email", statusCode: 401},
      };

      const user = await findUserByEmail(fastify.pg, email);
      if (!user || user.user_status !== "enabled") {
        return reply.status(401).send(genericError);
      }

      const twoFASetupResult = await twoFASetup(user.email);
      console.log("Created 2FA entry:", twoFASetupResult);

      return {two_fa: twoFASetupResult};
    },
  );

  // POST /auth/two-fa/verify - protected
  fastify.post(
    "/auth/two-fa/verify",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Auth"],
        summary: "Verify 2FA",
        description: "Verifies a 2FA token for the user.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email", "token"],
          properties: {
            email: {type: "string", format: "email"},
            token: {type: "string"},
            secret: {type: "string"},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              two_fa: {
                type: "object",
                properties: {
                  result: {type: "boolean"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email, token, secret} = request.body;

      const user = await findUserByEmail(fastify.pg, email);

      if (!user || user.user_status !== "enabled") {
        return reply.code(400).send({
          error: {message: "Invalid user or account disabled", statusCode: 400},
        });
      }

      const activeSecret = secret ? secret : user.two_fa_secret;

      if (!activeSecret) {
        return reply.code(400).send({
          error: {message: "User is not setup for 2FA", statusCode: 400},
        });
      }

      const isValid = await twoFAVerify(token, activeSecret);

      if (!isValid) {
        return {two_fa: {result: false}};
      }

      if (secret) {
        await updateUser(fastify.pg, user.id, {
          two_fa_secret: secret,
          two_fa_enabled: true,
        });
      }

      return {two_fa: {result: true}};
    },
  );

  // POST /auth/request-reset-password — protected
  fastify.post(
    "/auth/request-reset-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Request password reset",
        description: "Allows a user to request a password reset.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email"],
          properties: {
            email: {type: "string", format: "email"},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: {type: "string", description: "JWT bearer token"},
              user: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  email: {type: "string", format: "email"},
                  token: {type: "boolean"},
                  expires_at: {type: "string", format: "date-time"},
                  created_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email} = request.body;
      const genericError = {
        error: {message: "User does not exists", statusCode: 404},
      };

      const user = await findUserByEmail(fastify.pg, email);
      if (!user || user.user_status !== "enabled") {
        return reply.status(401).send(genericError);
      }

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

      const resetUrl = `https://${process.env.PBXSCRIBE_DOMAIN}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
      const info = await transporter.sendMail({
        from: `PBXScribe Support <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
        to: email,
        subject: "Reset your PBXScribe password",
        html: generatePasswordResetHtml(user.firstname, resetUrl),
      });
      console.log(`Password reset email sent: ${info.messageId}`);

      return {
        token,
        user: {
          id: user.id,
          client_id: user.client_id,
          email: user.email,
          expires_at: expiresAt,
          created_at: createdAt,
        },
      };
    },
  );

  // POST /auth/reset-password — protected
  fastify.post(
    "/auth/reset-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Reset password",
        description: "Allows a user to reset their password.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email", "token", "new_password"],
          properties: {
            email: {type: "string", format: "email"},
            token: {type: "string"},
            new_password: {type: "string", minLength: 8, maxLength: 255},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: {type: "string", description: "JWT bearer token"},
              user: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  email: {type: "string", format: "email"},
                  token: {type: "boolean"},
                  expires_at: {type: "string", format: "date-time"},
                  created_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email, token, new_password} = request.body;
      const genericError = {
        error: {
          message: "User does not exists or invalid token",
          statusCode: 404,
        },
      };

      const request_token = await findTokenByEmail(fastify.pg, email);
      if (!request_token || request_token.token !== token) {
        return reply.status(401).send(genericError);
      }

      const credentials = await findCredentialsByUserId(
        fastify.pg,
        request_token.user_id,
        "password",
      );
      const active = credentials.filter((c) => c.is_active);
      const matchedCredential = active[0] ?? null;

      if (!matchedCredential) {
        return reply.status(401).send(genericError);
      }

      deactivateCredential(fastify.pg, matchedCredential.id).catch(() => {});

      const hash = await hashPassword(new_password);
      await createCredential(fastify.pg, {
        userId: request_token.user_id,
        credentialType: "password",
        credentialHash: hash,
        label: "password",
      });
      await deleteToken(fastify.pg, {
        token: request_token.token,
      });
      return {
        user: {
          id: request_token.id,
          client_id: request_token.client_id,
          email: request_token.email,
        },
      };
    },
  );

  // POST /auth/set-password — protected
  fastify.post(
    "/auth/set-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Set password",
        description: "Allows a user to set their password.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email", "token", "new_password"],
          properties: {
            email: {type: "string", format: "email"},
            token: {type: "string"},
            new_password: {type: "string", minLength: 8, maxLength: 255},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: {type: "string", description: "JWT bearer token"},
              user: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  email: {type: "string", format: "email"},
                  token: {type: "boolean"},
                  expires_at: {type: "string", format: "date-time"},
                  created_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email, token, new_password} = request.body;
      const genericError = {
        error: {
          message: "User does not exist",
          statusCode: 404,
        },
      };

      const user = await findUserByEmail(fastify.pg, email);
      if (!user || user.user_status !== "enabled") {
        return reply.status(401).send(genericError);
      }

      const hash = await hashPassword(new_password);
      await createCredential(fastify.pg, {
        userId: user.id,
        credentialType: "password",
        credentialHash: hash,
        label: "password",
      });
      return {
        user: {
          id: user.id,
          client_id: user.client_id,
          email: user.email,
        },
      };
    },
  );

  // POST /auth/change-password — protected
  fastify.post(
    "/auth/change-password",
    {
      schema: {
        tags: ["Auth"],
        summary: "Change user password",
        description: "Allows a user to change their password.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["email", "password", "new_password"],
          properties: {
            email: {type: "string", format: "email"},
            password: {type: "string", minLength: 8, maxLength: 255},
            new_password: {type: "string", minLength: 8, maxLength: 255},
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: {type: "string", description: "JWT bearer token"},
              user: {
                type: "object",
                properties: {
                  id: {type: "integer"},
                  client_id: {type: "integer"},
                  email: {type: "string", format: "email"},
                  firstname: {type: "string"},
                  lastname: {type: "string"},
                  phone: {type: "string", minLength: 10, maxLength: 15},
                  sms_notification: {type: "boolean"},
                  timezone: {type: "string", minLength: 1, maxLength: 50},
                  user_type: {type: "string", enum: ["console", "api"]},
                  user_status: {
                    type: "string",
                    enum: ["enabled", "disabled"],
                  },
                  user_role: {
                    type: "string",
                    enum: ["viewer", "manager", "admin"],
                  },
                  two_fa_enabled: {type: "boolean"},
                  created_at: {type: "string", format: "date-time"},
                  updated_at: {type: "string", format: "date-time"},
                },
              },
            },
          },
          401: {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  message: {type: "string"},
                  statusCode: {type: "integer"},
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const {email, password, new_password} = request.body;
      const genericError = {
        error: {message: "Email or Password is incorrect", statusCode: 401},
      };

      const user = await findUserByEmail(fastify.pg, email);
      if (!user || user.user_status !== "enabled") {
        return reply.status(401).send(genericError);
      }

      const credentials = await findCredentialsByUserId(
        fastify.pg,
        user.id,
        "password",
      );
      const active = credentials.filter((c) => c.is_active);

      let matchedCredential = null;
      for (const cred of active) {
        const row = await fastify.pg.query(
          "SELECT credential_hash FROM user_credentials WHERE id = $1",
          [cred.id],
        );
        if (
          row.rows.length &&
          (await verifyPassword(password, row.rows[0].credential_hash))
        ) {
          matchedCredential = cred;
          break;
        }
      }

      if (!matchedCredential) {
        return reply.status(401).send(genericError);
      }

      deactivateCredential(fastify.pg, matchedCredential.id).catch(() => {});

      const hash = await hashPassword(new_password);
      await createCredential(fastify.pg, {
        userId: user.id,
        credentialType: "password",
        credentialHash: hash,
        label: "password",
      });

      let token = null;
      if (user.user_type === "api") {
        token = generateToken({
          sub: user.id,
          email: user.email,
          name: `${user.firstname} ${user.lastname}`,
        });
      }
      return {token, user};
    },
  );

  // GET /auth/me — protected
  fastify.get(
    "/auth/me",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Auth"],
        summary: "Get current user",
        description:
          "Returns the authenticated user profile decoded from the JWT or API key.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        response: {
          200: {
            type: "object",
            properties: {
              id: {type: "integer"},
              email: {type: "string", format: "email"},
              firstname: {type: "string"},
              lastname: {type: "string"},
              phone: {type: "string", minLength: 10, maxLength: 15},
              sms_notification: {type: "boolean"},
              timezone: {type: "string", minLength: 1, maxLength: 50},
              user_type: {type: "string", enum: ["console", "api"]},
              user_status: {
                type: "string",
                enum: ["enabled", "disabled"],
              },
              user_role: {
                type: "string",
                enum: ["viewer", "manager", "admin"],
              },
              two_fa_enabled: {type: "boolean"},
              created_at: {type: "string", format: "date-time"},
              updated_at: {type: "string", format: "date-time"},
            },
          },
        },
      },
    },
    async (request, reply) => {
      return request.user;
    },
  );
}

module.exports = authRoutes;

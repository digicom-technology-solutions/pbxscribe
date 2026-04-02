// Auth routes
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
                    enum: ["viewer", "manager", "admin"],
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

      updateLastUsed(fastify.pg, matchedCredential.id).catch(() => {});

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

      console.log("User requested password reset:", user);

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

      console.log("User requested password reset:", request_token);

      const credentials = await findCredentialsByUserId(
        fastify.pg,
        request_token.user_id,
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
          (await verifyPassword(new_password, row.rows[0].credential_hash))
        ) {
          matchedCredential = cred;
          break;
        }
      }

      if (!matchedCredential) {
        return reply.status(401).send(genericError);
      }

      console.log("Matched credential for password reset:", matchedCredential);

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

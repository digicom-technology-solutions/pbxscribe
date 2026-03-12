// User CRUD routes
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
    sms_notification: {type: "boolean"},
    timezone: {
      type: "string",
      enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
    },
    user_type: {type: "string", enum: ["console", "api"]},
    user_role: {type: "string", enum: ["owner", "manager", "viewer"]},
    user_status: {type: "string", enum: ["enabled", "disabled"]},
    two_fa_enabled: {type: "boolean"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

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
            pbx_email: {type: "string", format: "email"},
            firstname: {type: "string", minLength: 1, maxLength: 255},
            lastname: {type: "string", minLength: 1, maxLength: 255},
            password: {type: "string", minLength: 8, maxLength: 255},
            phone: {type: "string", minLength: 10, maxLength: 15},
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
              enum: ["owner", "manager", "viewer"],
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
        user_role,
        user_status,
        two_fa_enabled,
      } = request.body;

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
        const user = await createUser(fastify.pg, {
          client_id,
          email,
          pbx_email,
          firstname,
          lastname,
          phone: phone || null,
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
            sms_notification: {type: "boolean"},
            password: {type: "string", minLength: 8, maxLength: 255},
            timezone: {
              type: "string",
              enum: ["PKT", "GMT", "UTC", "EST", "CST", "MST", "PST"],
            },
            user_role: {
              type: "string",
              enum: ["owner", "manager", "viewer"],
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
      const deleted = await deleteUser(
        fastify.pg,
        request.params.client_id,
        request.params.id,
      );

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

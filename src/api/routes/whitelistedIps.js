// User CRUD routes
const {
  createWhitelistedIps,
  findWhitelistedIpById,
  updateWhitelistedIp,
  listWhitelistedIps,
  deleteWhitelistedIp,
} = require("../repositories/whitelistedIpsRepository");

const whitelistedIpsSchema = {
  type: "object",
  properties: {
    id: {type: "integer"},
    client_id: {type: "integer"},
    ip_address: {type: "string", format: "ipv4"},
    created_at: {type: "string", format: "date-time"},
    updated_at: {type: "string", format: "date-time"},
  },
};

/**
 * Register whitelisted IP CRUD routes
 * @param {FastifyInstance} fastify - Fastify instance
 */
async function whitelistedIpsRoutes(fastify) {
  // POST /whitelisted-ips — create whitelisted IP
  fastify.post(
    "/whitelisted-ips",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Whitelisted IPs"],
        summary: "Create a whitelisted IP",
        description:
          "Creates a new whitelisted IP record. Requires authentication.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        body: {
          type: "object",
          required: ["client_id", "ip_address"],
          properties: {
            client_id: {type: "integer"},
            ip_address: {type: "string", format: "ipv4"},
          },
          additionalProperties: false,
        },
        response: {
          201: whitelistedIpsSchema,
        },
      },
    },
    async (request, reply) => {
      const {client_id, ip_address} = request.body;

      try {
        const whitelistedIp = await createWhitelistedIps(fastify.pg, {
          client_id,
          ip_address,
        });

        return reply.status(201).send(whitelistedIp);
      } catch (error) {
        if (error.code === "23505") {
          return reply.status(409).send({
            error: {
              message: "A whitelisted IP with this address already exists",
              statusCode: 409,
            },
          });
        }
        throw error;
      }
    },
  );

  // GET /whitelisted-ips — list whitelisted IPs
  fastify.get(
    "/whitelisted-ips/client/:client_id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Whitelisted IPs"],
        summary: "List whitelisted IPs",
        description: "Returns a paginated list of whitelisted IPs",
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
              whitelistedIps: {type: "array", items: whitelistedIpsSchema},
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
      const {whitelistedIps, total} = await listWhitelistedIps(
        fastify.pg,
        request.params.client_id,
        {
          limit,
          offset,
        },
      );

      return {whitelistedIps, total, limit, offset};
    },
  );

  // GET /whitelisted-ips/:id — get whitelisted IP by ID
  fastify.get(
    "/whitelisted-ips/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Whitelisted IPs"],
        summary: "Get a whitelisted IP",
        description: "Returns a single whitelisted IP by ID.",
        security: [{bearerAuth: []}, {apiKeyAuth: []}],
        params: {
          type: "object",
          properties: {
            id: {type: "integer"},
          },
          required: ["id"],
        },
        response: {
          200: whitelistedIpsSchema,
        },
      },
    },
    async (request, reply) => {
      const whitelistedIp = await findWhitelistedIpById(
        fastify.pg,
        request.params.id,
      );

      if (!whitelistedIp) {
        return reply.status(404).send({
          error: {
            message: "Whitelisted IP not found",
            statusCode: 404,
          },
        });
      }

      return whitelistedIp;
    },
  );

  // PUT /whitelisted-ips/:id — update whitelisted IP
  fastify.put(
    "/whitelisted-ips/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Whitelisted IPs"],
        summary: "Update a whitelisted IP",
        description: "Updates the details of an existing whitelisted IP.",
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
            ip_address: {type: "string", format: "ipv4"},
          },
          additionalProperties: false,
          minProperties: 1,
        },
        response: {
          200: whitelistedIpsSchema,
        },
      },
    },
    async (request, reply) => {
      const whitelistedIp = await updateWhitelistedIp(
        fastify.pg,
        request.params.id,
        request.body,
      );

      if (!whitelistedIp) {
        return reply.status(404).send({
          error: {
            message: "Whitelisted IP not found",
            statusCode: 404,
          },
        });
      }

      return whitelistedIp;
    },
  );

  // DELETE /whitelisted-ips/:id — delete whitelisted IP
  fastify.delete(
    "/whitelisted-ips/id/:id",
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ["Whitelisted IPs"],
        summary: "Delete a whitelisted IP",
        description: "Permanently deletes a whitelisted IP record by ID.",
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
      const deleted = await deleteWhitelistedIp(fastify.pg, request.params.id);

      if (!deleted) {
        return reply.status(404).send({
          error: {
            message: "Whitelisted IP not found",
            statusCode: 404,
          },
        });
      }

      return reply.status(204).send();
    },
  );
}

module.exports = whitelistedIpsRoutes;

// CI/CD verification route — protected, remove once pipeline is stable
async function cicdRoutes(fastify) {
    fastify.get('/cicd/status', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['CI/CD'],
            summary: 'CI/CD deployment check',
            description: 'Verified the latest automated deployment. Requires auth.',
            security: [{ bearerAuth: [] }],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        status:          { type: 'string' },
                        environment:     { type: 'string' },
                        commitId:        { type: 'string' },
                        commitMessage:   { type: 'string' },
                        lambdaFunction:  { type: 'string' },
                        lambdaVersion:   { type: 'string' },
                        deployedAt:      { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
    }, async (request, reply) => {
        return {
            status:         'ok',
            environment:    process.env.NODE_ENV            || 'development',
            commitId:       process.env.COMMIT_SHA          || 'unknown',
            commitMessage:  process.env.COMMIT_MESSAGE      || 'unknown',
            lambdaFunction: process.env.AWS_LAMBDA_FUNCTION_NAME    || 'local',
            lambdaVersion:  process.env.AWS_LAMBDA_FUNCTION_VERSION || 'local',
            deployedAt:     new Date().toISOString(),
        };
    });
}

module.exports = cicdRoutes;

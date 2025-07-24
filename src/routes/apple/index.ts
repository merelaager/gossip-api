import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { SuccessResponse } from "../../schemas/jsend.js";
import { Type } from "@sinclair/typebox";
import prisma from "../../utils/prisma.js";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/tokens",
    {
      schema: {
        body: Type.Object({
          token: Type.String(),
          userId: Type.String(),
        }),
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({
              id: Type.String(),
              username: Type.String(),
              role: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { token, userId } = request.body;
      await prisma.appleToken.upsert({
        where: { id: token },
        update: {},
        create: {
          id: token,
          userId,
        },
      });

      return reply.status(StatusCodes.CREATED).send();
    },
  );
};

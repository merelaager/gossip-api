import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import { TokenType } from "../../generated/prisma/client.js";
import prisma from "../../utils/prisma.js";

import { sendNotificationToTokens } from "../../utils/apnService.js";

import { SuccessResponse } from "../../schemas/jsend.js";

const appleRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/tokens",
    {
      schema: {
        body: Type.Object({
          token: Type.String(),
          userId: Type.String(),
          tokenType: Type.Optional(
            Type.Union([
              Type.Literal("development"),
              Type.Literal("production"),
            ]),
          ),
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
      const { token, userId, tokenType } = request.body;
      await prisma.appleToken.upsert({
        where: { id: token },
        update: {},
        create: {
          id: token,
          userId,
          tokenType:
            tokenType === "development" ? TokenType.DEV : TokenType.PROD,
        },
      });

      return reply.status(StatusCodes.CREATED).send();
    },
  );

  fastify.delete(
    "/tokens/:token",
    {
      schema: {
        params: Type.Object({
          token: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const { token } = request.params;

      await prisma.appleToken.deleteMany({
        where: { id: token },
      });

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );

  fastify.post(
    "/tokens/:token/notifications/test",
    {
      schema: {
        params: Type.Object({
          token: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const { token } = request.params;

      await sendNotificationToTokens(
        [token],
        "",
        "Testteavitus",
        "Kui seda teavitust näed, siis peaks kõik toimima!",
      );

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default appleRoute;

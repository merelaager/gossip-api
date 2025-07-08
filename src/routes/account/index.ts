import { Type } from "@sinclair/typebox";
import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import prisma from "../../utils/prisma.js";
import { createSuccessResponse } from "../../utils/jsend.js";

import { SuccessResponse } from "../../schemas/jsend.js";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
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
    async (request, response) => {
      const { userId } = request.session.user;

      const user = (await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
        },
      }))!;

      return response.code(StatusCodes.OK).send(
        createSuccessResponse({
          id: user.id,
          username: user.username,
          role: user.role,
        }),
      );
    },
  );
};

export default postsRoute;

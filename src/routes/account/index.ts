import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import * as argon2 from "argon2";

import prisma from "../../utils/prisma.js";
import {
  createFailResponse,
  createSuccessResponse,
} from "../../utils/jsend.js";

import { FailResponse, SuccessResponse } from "../../schemas/jsend.js";

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
  fastify.post(
    "/change-password",
    {
      schema: {
        body: Type.Object({
          newPassword: Type.String(),
        }),
        response: {
          [StatusCodes.BAD_REQUEST]: FailResponse(
            Type.Object({
              message: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.session.user;
      const { newPassword } = request.body;

      if (newPassword.length < 8) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: "Salasõna on liiga lühike.",
          }),
        );
      }

      const passwordHash = await argon2.hash(newPassword);
      await prisma.user.update({
        where: { id: userId },
        data: { password: passwordHash },
      });

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
};

export default postsRoute;

import { randomUUID } from "node:crypto";

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
    async (request, reply) => {
      const { userId } = request.session.user;

      const user = (await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          role: true,
        },
      }))!;

      return reply.code(StatusCodes.OK).send(
        createSuccessResponse({
          id: user.id,
          username: user.username,
          role: user.role,
        }),
      );
    },
  );
  fastify.delete("/", async (request, reply) => {
    const { userId } = request.session.user;
    await request.session.destroy();
    reply.clearCookie("sessionId");

    // Mark the account for deletion.
    // Do not delete it immediately for forensic purposes.
    // E.g. a child posts some harmful content (that does not manage to get approved)
    // but then deletes the account before any moderator can see it.
    await prisma.user.update({
      where: { id: userId },
      data: { isDeleted: true, username: randomUUID() },
    });

    await prisma.postLike.deleteMany({
      where: { userId: userId },
    });

    // For similar reasons as above, mark the user's posts for deletion,
    // but do not actually remove the user.
    await prisma.post.updateMany({
      where: { authorId: userId },
      data: { hidden: true },
    });

    return reply.code(StatusCodes.NO_CONTENT).send();
  });
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

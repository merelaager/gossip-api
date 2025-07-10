import { randomBytes } from "node:crypto";

import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { CrockfordBase32 } from "crockford-base32";

import prisma from "../../utils/prisma.js";
import {
  createFailResponse,
  createSuccessResponse,
} from "../../utils/jsend.js";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        body: Type.Object({
          users: Type.Array(
            Type.Object({
              name: Type.String(),
              isAnon: Type.Boolean(),
            }),
          ),
        }),
      },
    },
    async (request, reply) => {
      const { userId } = request.session.user;
      const { users } = request.body;

      const userData = (await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, shift: true },
      }))!;

      if (userData.role !== "ADMIN") {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            message: "Puuduvad õigused kutsete genereerimiseks.",
          }),
        );
      }

      const inviteCodes = await prisma.inviteCode.findMany({
        select: { id: true },
      });

      const existingCodes = new Set(inviteCodes.map((i) => i.id));
      const signupTokens: {
        name: string;
        role: "USER" | "READER";
        inviteCode: string;
      }[] = [];

      users.forEach((user) => {
        let stringNum = "";
        while (true) {
          const buf = randomBytes(4);
          const randomUint32 = buf.readUInt32BE(0);
          stringNum = `${randomUint32}`;
          if (!existingCodes.has(stringNum)) break;
        }

        // If the user is not allowed to post, it's because they are
        // too young to be able to consent to the processing of their personal data.
        // Therefore, keep them anonymous.
        signupTokens.push({
          name: user.isAnon ? "Anonüümne" : user.name,
          role: user.isAnon ? "READER" : "USER",
          inviteCode: stringNum,
        });
      });

      await prisma.inviteCode.createMany({
        data: signupTokens.map((token) => ({
          id: token.inviteCode,
          name: token.name,
          role: token.role,
          shift: userData.shift,
        })),
      });

      const createdTokens = signupTokens.map((i) => {
        return {
          code: CrockfordBase32.encode(parseInt(i.inviteCode)),
          name: i.name,
        };
      });

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ invites: createdTokens }));
    },
  );
};

export default postsRoute;

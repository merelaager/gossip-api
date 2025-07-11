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
import { anonUsernames } from "../../utils/usernames.js";
import { FailResponse, SuccessResponse } from "../../schemas/jsend.js";

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
          // 5 bytes will give us 8 characters, which is neatly
          // split with a dash in the middle.
          const codeNum = generateXByteRandom(5);
          stringNum = codeNum.toString();
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
        const regCode = CrockfordBase32.encode(parseInt(i.inviteCode));
        console.log(regCode);
        return {
          code: regCode.slice(0, 4) + "-" + regCode.slice(4),
          name: i.name,
        };
      });

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ invites: createdTokens }));
    },
  );
  fastify.get(
    "/:code",
    {
      schema: {
        params: Type.Object({
          code: Type.String(),
        }),
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({
              role: Type.String(),
              username: Type.Optional(Type.String()),
            }),
          ),
          "4xx": FailResponse(
            Type.Object({
              message: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { code } = request.params;

      let rawToken: string;
      try {
        rawToken = CrockfordBase32.decode(code, {
          asNumber: true,
        }).toString();
      } catch (err) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: "Kood on kehtetu.",
          }),
        );
      }

      const registrationInfo = await prisma.inviteCode.findUnique({
        where: { id: rawToken },
      });

      if (!registrationInfo) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: "Registreerimiskoodi ei leitud.",
          }),
        );
      }

      if (registrationInfo.used) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: "Registreerimiskoodi on juba kasutatud.",
          }),
        );
      }

      const responseData: { role: string; username?: string } = {
        role: registrationInfo.role,
      };

      if (registrationInfo.role === "READER") {
        const takenAnonUsernames = new Set(
          (
            await prisma.user.findMany({
              where: { role: "READER" },
              select: { username: true },
            })
          ).map((i) => i.username),
        );
        const usernames = Array.from(
          anonUsernames.difference(takenAnonUsernames),
        ).sort();
        responseData.username =
          usernames[Math.floor(Math.random() * usernames.length)];
      }

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse(responseData));
    },
  );
};

const generateXByteRandom = (byteLen: number) => {
  while (true) {
    const buf = randomBytes(byteLen);
    if (buf[0] & 0x80) {
      let num = 0n;
      for (let i = 0; i < buf.length; i++) {
        num += BigInt(buf[i]) << (8n * BigInt(i));
      }
      return num;
    }
  }
};

export default postsRoute;

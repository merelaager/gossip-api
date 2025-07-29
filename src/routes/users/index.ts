import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { CrockfordBase32 } from "crockford-base32";
import * as argon2 from "argon2";

import prisma from "../../utils/prisma.js";
import { anonUsernames, validateUsername } from "../../utils/usernames.js";
import {
  createFailResponse,
  createSuccessResponse,
} from "../../utils/jsend.js";
import { FailResponse, SuccessResponse } from "../../schemas/jsend.js";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/fake",
    {
      schema: {
        body: Type.Object({ userCount: Type.Number() }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      }))!;

      for (let i = 0; i < request.body.userCount; i++) {
        try {
          await prisma.user.create({
            data: {
              id: `fake-${i}`,
              username: `fake-${i}`,
              name: "Fake",
              role: "USER",
              shift: userData.shift,
              password: "password",
            },
          });
        } catch {}
      }

      return reply.code(StatusCodes.CREATED).send();
    },
  );
  fastify.post(
    "/",
    {
      schema: {
        body: Type.Object({
          token: Type.String(),
          username: Type.String(),
          password: Type.String(),
        }),
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({
              id: Type.String(),
              username: Type.String(),
              role: Type.String(),
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
      const { token, username, password } = request.body;

      const rawToken = CrockfordBase32.decode(token, {
        asNumber: true,
      }).toString();

      const registrationInfo = await prisma.inviteCode.findUnique({
        where: { id: rawToken },
      });

      if (!registrationInfo) {
        return reply.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
          createFailResponse({
            message: "Registreerimiskoodi ei leitud.",
          }),
        );
      }

      if (registrationInfo.used) {
        return reply.status(StatusCodes.CONFLICT).send(
          createFailResponse({
            message: "Registreerimiskoodi on juba kasutatud.",
          }),
        );
      }

      const cleanedUsername = username.toLowerCase();
      const usernameError = validateUsername(cleanedUsername);
      if (usernameError) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: usernameError,
          }),
        );
      }

      const userWithUsername = await prisma.user.findUnique({
        where: { username: cleanedUsername },
        select: { username: true },
      });

      if (userWithUsername) {
        return reply.status(StatusCodes.CONFLICT).send(
          createFailResponse({
            message: "Kasutajanimi on juba kasutuses.",
          }),
        );
      }

      if (
        registrationInfo.role === "READER" &&
        !anonUsernames.has(cleanedUsername)
      ) {
        return reply.status(StatusCodes.UNPROCESSABLE_ENTITY).send(
          createFailResponse({
            message: "Kasutajanimi ei kuulu anonüümsete kasutajanimede hulka.",
          }),
        );
      }

      const passwordHash = await argon2.hash(password.trim());
      const user = await prisma.user.create({
        data: {
          username: cleanedUsername,
          password: passwordHash,
          role: registrationInfo.role,
          shift: registrationInfo.shift,
          name: registrationInfo.name,
        },
      });

      await prisma.inviteCode.update({
        where: { id: rawToken },
        data: { used: true },
      });

      request.session.user = { userId: user.id };
      await request.session.save();

      return reply.status(StatusCodes.OK).send(
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

import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";
import { Type } from "@sinclair/typebox";
import { FailResponse, SuccessResponse } from "../../schemas/jsend.js";
import prisma from "../../utils/prisma.js";
import * as argon2 from "argon2";
import { createFailResponse, createSuccessResponse } from "../../utils/jsend.js";
import { CredentialsSchema } from "../../schemas/auth.js";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post(
    "/login",
    {
      schema: {
        body: CredentialsSchema,
        response: {
          [StatusCodes.OK]: SuccessResponse(
            Type.Object({
              username: Type.String(),
            }),
          ),
          [StatusCodes.UNAUTHORIZED]: FailResponse(
            Type.Object({
              message: Type.String(),
            }),
          ),
        },
      },
    },
    async (request, response) => {
      const { username, password } = request.body;

      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user || !(await argon2.verify(user.password, password))) {
        return response.status(StatusCodes.UNAUTHORIZED).send(
          createFailResponse({
            message: "Vale kasutajanimi või parool!",
          }),
        );
      }

      request.session.user = { userId: user.id };
      await request.session.save();

      return response.code(StatusCodes.OK).send(
        createSuccessResponse({
          username,
        }),
      );
    },
  );
};

export default postsRoute;

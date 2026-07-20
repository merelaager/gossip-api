import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

import prisma from "../../utils/prisma.js";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../../utils/jsend.js";

import { ErrorResponse, SuccessResponse } from "../../schemas/jsend.js";
import { AppPlatformQuery, AppVersionData } from "../../schemas/app.js";

const GENERAL_INFO_KEY_BY_PLATFORM = {
  android: "androidVersion",
  ios: "iosVersion",
} as const;

const appRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/version",
    {
      schema: {
        querystring: AppPlatformQuery,
        response: {
          [StatusCodes.OK]: SuccessResponse(AppVersionData),
          [StatusCodes.NOT_FOUND]: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const key = GENERAL_INFO_KEY_BY_PLATFORM[request.query.platform];
      const info = await prisma.generalInfo.findUnique({ where: { key } });

      if (!info) {
        return reply
          .status(StatusCodes.NOT_FOUND)
          .send(createErrorResponse(`Versiooniinfo puudub: ${key}`));
      }

      return reply
        .status(StatusCodes.OK)
        .send(createSuccessResponse({ version: info.value }));
    },
  );
};

export default appRoute;

import { FastifyInstance } from "fastify";
import { StatusCodes } from "http-status-codes";

import { createFailResponse } from "../utils/jsend.js";

export default async function (fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/auth/login")) {
      return;
    }

    if (request.url.startsWith("/codes") && request.method === "GET") {
      return;
    }

    if (request.url === "/users" && request.method === "POST") {
      return;
    }

    if (!request.session.user) {
      return reply
        .code(StatusCodes.UNAUTHORIZED)
        .send(
          createFailResponse({ message: "Ligipääsuks pead olema autenditud!" }),
        );
    }
  });
}

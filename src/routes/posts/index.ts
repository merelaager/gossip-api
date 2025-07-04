import { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { StatusCodes } from "http-status-codes";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get("/", (request, response) => {
    response.status(StatusCodes.OK).send({ message: "Server is up!" });
  });
};

export default postsRoute;

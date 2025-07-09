import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import fastifyMultipart from "@fastify/multipart";
import { StatusCodes } from "http-status-codes";
import { fileTypeFromFile } from "file-type";

import prisma from "../../utils/prisma.js";
import {
  createErrorResponse,
  createFailResponse,
  createSuccessResponse,
} from "../../utils/jsend.js";

const postsRoute: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        querystring: Type.Object({
          page: Type.Number(),
          limit: Type.Optional(Type.Number()),
        }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      });

      if (!userData) {
        return reply.send(
          createSuccessResponse({ posts: [], currentPage: 1, totalPages: 1 }),
        );
      }

      const postsPerPage = request.query.limit || 15;
      const pageNumber = request.query.page || 1;

      const searchOptions = {
        shift: userData.shift,
        published: true,
        hidden: false,
      };

      const { posts, totalPages } = await fetchPosts(
        searchOptions,
        postsPerPage,
        pageNumber,
        user.userId,
      );

      return reply.send(
        createSuccessResponse({ posts, currentPage: pageNumber, totalPages }),
      );
    },
  );
  fastify.get(
    "/my",
    {
      schema: {
        querystring: Type.Object({
          page: Type.Number(),
          limit: Type.Optional(Type.Number()),
        }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      });

      if (!userData) {
        return reply.send(
          createSuccessResponse({ posts: [], currentPage: 1, totalPages: 1 }),
        );
      }

      const postsPerPage = request.query.limit || 15;
      const pageNumber = request.query.page || 1;

      const searchOptions = {
        shift: userData.shift,
        hidden: false,
        authorId: user.userId,
      };

      const { posts, totalPages } = await fetchPosts(
        searchOptions,
        postsPerPage,
        pageNumber,
        user.userId,
      );

      return reply.send(
        createSuccessResponse({ posts, currentPage: pageNumber, totalPages }),
      );
    },
  );
  fastify.get(
    "/waitlist",
    {
      schema: {
        querystring: Type.Object({
          page: Type.Number(),
          limit: Type.Optional(Type.Number()),
        }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true, role: true },
      });

      if (!userData || userData.role !== "ADMIN") {
        return reply.send(
          createSuccessResponse({ posts: [], currentPage: 1, totalPages: 1 }),
        );
      }

      const postsPerPage = request.query.limit || 15;
      const pageNumber = request.query.page || 1;

      const searchOptions = {
        shift: userData.shift,
        published: false,
        hidden: false,
      };

      const { posts, totalPages } = await fetchPosts(
        searchOptions,
        postsPerPage,
        pageNumber,
        user.userId,
      );

      return reply.send(
        createSuccessResponse({ posts, currentPage: pageNumber, totalPages }),
      );
    },
  );
  fastify.get(
    "/liked",
    {
      schema: {
        querystring: Type.Object({
          page: Type.Number(),
          limit: Type.Optional(Type.Number()),
        }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      });

      if (!userData) {
        return reply.send(
          createSuccessResponse({ posts: [], currentPage: 1, totalPages: 1 }),
        );
      }

      const postsPerPage = request.query.limit || 15;
      const pageNumber = request.query.page || 1;

      const searchOptions = {
        shift: userData.shift,
        published: true,
        hidden: false,
        likes: {
          some: {
            userId: user.userId,
          },
        },
      };

      const { posts, totalPages } = await fetchPosts(
        searchOptions,
        postsPerPage,
        pageNumber,
        user.userId,
      );

      return reply.send(
        createSuccessResponse({ posts, currentPage: pageNumber, totalPages }),
      );
    },
  );
  fastify.get(
    "/:postId",
    { schema: { params: Type.Object({ postId: Type.String() }) } },
    async (request, reply) => {
      const { user } = request.session;

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { role: true, shift: true },
      }))!;

      const post = await prisma.post.findUnique({
        where: { id: request.params.postId },
        include: {
          _count: {
            select: { likes: true },
          },
          likes: {
            where: {
              userId: user.userId,
            },
          },
        },
      });

      if (!post || post.hidden || userData.shift !== post.shift) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      if (
        !post.published &&
        userData.role === "USER" &&
        post.authorId !== user.userId
      ) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      const isLiked = post.likes.length > 0;
      const likeCount = post._count.likes;
      const filteredPost = {
        id: post.id,
        title: post.title,
        content: post.content,
        imageId: post.imageId,
        published: post.published,
        createdAt: post.createdAt,
        isLiked,
        likeCount,
      };

      return reply.send(createSuccessResponse({ post: filteredPost }));
    },
  );
  fastify.patch(
    "/:postId",
    {
      schema: {
        params: Type.Object({ postId: Type.String() }),
        body: Type.Partial(Type.Object({ published: Type.Boolean() })),
      },
    },
    async (request, reply) => {
      const { user } = request.session;

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { role: true, shift: true },
      }))!;

      const post = await prisma.post.findUnique({
        where: { id: request.params.postId },
      });

      if (!post || userData.shift !== post.shift) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      if (userData.role !== "ADMIN") {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Puuduvad postituse muutmise õigused!",
          }),
        );
      }

      if (request.body.published !== undefined) {
        await prisma.post.update({
          where: { id: request.params.postId },
          data: { published: request.body.published },
        });
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
  fastify.put(
    "/:postId/likes/:userId",
    {
      schema: {
        params: Type.Object({ postId: Type.String(), userId: Type.String() }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;
      const { postId, userId } = request.params;

      if (user.userId !== userId) {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            message:
              "Puuduvad õigused kasutaja nimel postitusele meeldimist lisada.",
          }),
        );
      }

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      }))!;

      const post = await prisma.post.findUnique({
        where: { id: request.params.postId },
      });

      if (!post || userData.shift !== post.shift) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      const postLike = await prisma.postLike.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { postId: true },
      });

      if (postLike) {
        return reply.status(StatusCodes.CREATED).send();
      }

      await prisma.postLike.create({
        data: { postId, userId },
      });

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
  fastify.delete(
    "/:postId/likes/:userId",
    {
      schema: {
        params: Type.Object({ postId: Type.String(), userId: Type.String() }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;
      const { postId, userId } = request.params;

      if (user.userId !== userId) {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            message: "Puuduvad õigused kasutaja meeldimise eemaldamiseks.",
          }),
        );
      }

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      }))!;

      const post = await prisma.post.findUnique({
        where: { id: request.params.postId },
      });

      if (!post || userData.shift !== post.shift) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      const postLike = await prisma.postLike.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { postId: true },
      });

      if (postLike) {
        await prisma.postLike.delete({
          where: { postId_userId: { postId, userId } },
        });
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
  fastify.delete(
    "/:postId",
    { schema: { params: Type.Object({ postId: Type.String() }) } },
    async (request, reply) => {
      const { user } = request.session;

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { role: true, shift: true },
      }))!;

      const post = await prisma.post.findUnique({
        where: { id: request.params.postId },
      });

      if (!post || userData.shift !== post.shift) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      if (post.authorId !== user.userId && userData.role !== "ADMIN") {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            postId: request.params.postId,
            message: "Puuduvad postituse kustutamise õigused!",
          }),
        );
      }

      await prisma.post.update({
        where: { id: request.params.postId },
        data: { hidden: true },
      });

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
  fastify.post(
    "/",
    {
      schema: {
        body: Type.Object({
          title: Type.String({ minLength: 1 }),
          content: Type.Optional(Type.String({ maxLength: 15_000 })),
          imageId: Type.Optional(Type.String({ maxLength: 255 })),
        }),
      },
    },
    async (request, reply) => {
      const { userId } = request.session.user;
      const { title, content, imageId } = request.body;

      const userData = await prisma.user.findUnique({
        where: { id: userId },
        select: { shift: true },
      });

      if (!userData) {
        console.warn(
          `User with ID ${userId} is authenticated but could not be found in DB.`,
        );
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            user: "Tundmatu kasutaja. Sessioon võib olla aegunud.",
          }),
        );
      }

      if (!content && !imageId) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            format: "Postitus peab sisaldama teksti või pilti.",
          }),
        );
      }

      const fields: { title: string; content?: string; imageId?: string } = {
        title,
      };
      if (content) {
        fields.content = content;
      }
      if (imageId) {
        fields.imageId = imageId;
      }

      const post = await prisma.post.create({
        data: { ...fields, authorId: userId, shift: userData.shift },
      });

      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ postId: post.id }));
    },
  );
  fastify.register(fastifyMultipart, {
    limits: {
      fields: 0,
      files: 1,
      fileSize: 5242880, // 5 MiB
    },
  });
  fastify.post("/images", async (request, reply) => {
    const files = await request.saveRequestFiles();

    if (files.length !== 1) {
      return reply.status(StatusCodes.BAD_REQUEST).send(
        createFailResponse({
          message: "Fail puudub!",
        }),
      );
    }

    const filePath = files[0].filepath;
    const mimeType = (await fileTypeFromFile(filePath))?.mime;

    const allowedMimeTypes = ["image/png", "image/jpeg"];
    if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
      return reply.status(StatusCodes.BAD_REQUEST).send(
        createFailResponse({
          message: `Failitüüp '${mimeType}' ei ole lubatud.`,
          acceptedTypes: allowedMimeTypes,
        }),
      );
    }

    const sha256Hash = await hashImage(filePath);
    const fileName = sha256Hash + "." + mimeType.split("/")[1];
    const uploadSucceeded = await fastify.uploadToCDN(filePath, fileName);

    if (!uploadSucceeded) {
      return reply
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send(createErrorResponse("Pilti ei õnnestunud üles laadida."));
    }

    return reply
      .status(StatusCodes.OK)
      .send(createSuccessResponse({ fileName }));
  });
};

type SearchOptions = {
  shift: number;
  published?: boolean;
  hidden: boolean;
  authorId?: string;
  likes?: { some: { userId: string } };
};

const hashImage = async (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("error", reject);
    hash.on("error", reject);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
};

const fetchPosts = async (
  searchOptions: SearchOptions,
  pageSize: number,
  pageNumber: number,
  userId: string,
) => {
  const postCount = await prisma.post.count({
    where: searchOptions,
  });
  const totalPages = Math.ceil(postCount / pageSize);

  const posts = await prisma.post.findMany({
    where: searchOptions,
    orderBy: { createdAt: "desc" },
    skip: pageSize * (pageNumber - 1),
    take: pageSize,
    include: {
      _count: {
        select: { likes: true },
      },
      likes: { where: { userId } },
    },
  });

  return {
    posts: posts.map((post) => {
      return {
        id: post.id,
        title: post.title,
        content: post.content,
        imageId: post.imageId,
        createdAt: post.createdAt,
        published: post.published,
        likeCount: post._count.likes,
        isLiked: post.likes.length > 0,
      };
    }),
    totalPages,
  };
};

export default postsRoute;

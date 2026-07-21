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
import {
  APN_TOKEN_TYPE,
  canDeliverApprovedPostNotification,
  sendModerationQueueNotification,
  sendNotificationToTokens,
} from "../../utils/apnService.js";

import { FailResponse, SuccessResponse } from "../../schemas/jsend.js";

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
            select: { likes: true, comments: { where: { hidden: false } } },
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
        commentCount: post._count.comments,
      };

      return reply.send(createSuccessResponse({ post: filteredPost }));
    },
  );
  fastify.get(
    "/:postId/comments",
    {
      schema: {
        params: Type.Object({ postId: Type.String() }),
        querystring: Type.Object({
          page: Type.Optional(Type.Number()),
          limit: Type.Optional(Type.Number()),
        }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;
      const { postId } = request.params;

      const post = await findVisiblePost(postId, user.userId);

      if (!post) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      const commentsPerPage = request.query.limit || 15;
      const pageNumber = request.query.page || 1;

      const where = { postId, hidden: false };

      const commentCount = await prisma.comment.count({ where });
      const totalPages = Math.ceil(commentCount / commentsPerPage);

      const comments = await prisma.comment.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip: commentsPerPage * (pageNumber - 1),
        take: commentsPerPage,
      });

      return reply.send(
        createSuccessResponse({
          comments: comments.map((comment) => ({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            isAuthor: comment.authorId === user.userId,
          })),
          currentPage: pageNumber,
          totalPages,
        }),
      );
    },
  );
  fastify.post(
    "/:postId/comments",
    {
      schema: {
        params: Type.Object({ postId: Type.String() }),
        body: Type.Object({
          content: Type.String({ minLength: 1, maxLength: 5_000 }),
        }),
        response: {
          [StatusCodes.CREATED]: SuccessResponse(
            Type.Object({
              commentId: Type.String(),
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
      const { user } = request.session;
      const { postId } = request.params;
      const content = request.body.content.trim();

      const post = await findVisiblePost(postId, user.userId);

      if (!post) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            message: "Postitust ei leitud.",
          }),
        );
      }

      if (!content) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: "Kommentaar ei tohi olla tühi.",
          }),
        );
      }

      const comment = await prisma.comment.create({
        data: { content, postId, authorId: user.userId },
      });

      return reply
        .status(StatusCodes.CREATED)
        .send(createSuccessResponse({ commentId: comment.id }));
    },
  );
  fastify.delete(
    "/:postId/comments/:commentId",
    {
      schema: {
        params: Type.Object({
          postId: Type.String(),
          commentId: Type.String(),
        }),
      },
    },
    async (request, reply) => {
      const { user } = request.session;
      const { postId, commentId } = request.params;

      const userData = (await prisma.user.findUnique({
        where: { id: user.userId },
        select: { role: true, shift: true },
      }))!;

      const post = await prisma.post.findUnique({ where: { id: postId } });

      if (!post || userData.shift !== post.shift) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            postId,
            message: "Postitust ei leitud.",
          }),
        );
      }

      if (userData.role !== "ADMIN") {
        return reply.status(StatusCodes.FORBIDDEN).send(
          createFailResponse({
            commentId,
            message: "Puuduvad kommentaari kustutamise õigused!",
          }),
        );
      }

      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      });

      if (!comment || comment.postId !== postId) {
        return reply.status(StatusCodes.NOT_FOUND).send(
          createFailResponse({
            commentId,
            message: "Kommentaari ei leitud.",
          }),
        );
      }

      await prisma.comment.update({
        where: { id: commentId },
        data: { hidden: true },
      });

      return reply.status(StatusCodes.NO_CONTENT).send();
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
          data: { published: request.body.published, approverId: user.userId },
        });

        if (canDeliverApprovedPostNotification()) {
          const tokens = await prisma.appleToken.findMany({
            where: { tokenType: APN_TOKEN_TYPE, user: { shift: post.shift } },
            select: { id: true },
          });

          const parsedTokens = tokens.map((token) => token.id);
          await sendNotificationToTokens(
            parsedTokens,
            post.id,
            "Uus postitus",
            post.title,
            request.log,
          );
        }
      }

      return reply.status(StatusCodes.NO_CONTENT).send();
    },
  );
  fastify.post(
    "/:postId/likes",
    {
      schema: {
        params: Type.Object({ postId: Type.String() }),
        body: Type.Object({ likeCount: Type.Number() }),
      },
    },
    async (request, reply) => {
      const { postId } = request.params;
      const { likeCount } = request.body;
      for (let i = 0; i < likeCount; i++) {
        try {
          await prisma.postLike.create({
            data: {
              postId,
              userId: `fake-${i}`,
            },
          });
        } catch (err) {
          console.log(err);
        }
      }
      return reply.status(StatusCodes.CREATED).send();
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
        response: {
          [StatusCodes.CREATED]: SuccessResponse(
            Type.Object({
              postId: Type.String(),
            }),
          ),
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
      const { title, content, imageId } = request.body;

      const userData = (await prisma.user.findUnique({
        where: { id: userId },
        select: { shift: true },
      }))!;

      if (!content && !imageId) {
        return reply.status(StatusCodes.BAD_REQUEST).send(
          createFailResponse({
            message: "Postitus peab sisaldama teksti või pilti.",
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

      const tokens = await prisma.appleToken.findMany({
        where: {
          tokenType: APN_TOKEN_TYPE,
          user: { shift: post.shift, role: "ADMIN" },
        },
        select: { id: true },
      });

      const queueLength = await prisma.post.count({
        where: { shift: post.shift, published: false, hidden: false },
      });

      const parsedTokens = tokens.map((token) => token.id);
      await sendModerationQueueNotification(
        parsedTokens,
        queueLength,
        request.log,
      );

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

const findVisiblePost = async (postId: string, userId: string) => {
  const userData = (await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, shift: true },
  }))!;

  const post = await prisma.post.findUnique({ where: { id: postId } });

  if (!post || post.hidden || userData.shift !== post.shift) {
    return null;
  }

  if (!post.published && userData.role === "USER" && post.authorId !== userId) {
    return null;
  }

  return post;
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
  const where = {
    ...searchOptions,
    createdAt: {
      gte: new Date(new Date().getFullYear(), 0, 1),
    },
  };

  const postCount = await prisma.post.count({
    where,
  });
  const totalPages = Math.ceil(postCount / pageSize);

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: pageSize * (pageNumber - 1),
    take: pageSize,
    include: {
      _count: {
        select: { likes: true, comments: { where: { hidden: false } } },
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
        commentCount: post._count.comments,
        isLiked: post.likes.length > 0,
      };
    }),
    totalPages,
  };
};

export default postsRoute;

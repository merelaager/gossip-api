import {
  FastifyPluginAsyncTypebox,
  Type,
} from "@fastify/type-provider-typebox";
import prisma from "../../utils/prisma";
import { createSuccessResponse } from "../../utils/jsend";
import { StatusCodes } from "http-status-codes";

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
    async (request, response) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      });

      if (!userData) {
        return response.send(
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
      );

      return response.send(
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
    async (request, response) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      });

      if (!userData) {
        return response.send(
          createSuccessResponse({ posts: [], currentPage: 1, totalPages: 1 }),
        );
      }

      const postsPerPage = request.query.limit || 15;
      const pageNumber = request.query.page || 1;

      const searchOptions = {
        shift: userData.shift,
        published: true,
        hidden: false,
        authorId: user.userId,
      };

      const { posts, totalPages } = await fetchPosts(
        searchOptions,
        postsPerPage,
        pageNumber,
      );

      return response.send(
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
    async (request, response) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { shift: true },
      });

      if (!userData) {
        return response.send(
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
      );

      return response.send(
        createSuccessResponse({ posts, currentPage: pageNumber, totalPages }),
      );
    },
  );
  fastify.get(
    "/:postId",
    { schema: { params: Type.Object({ postId: Type.String() }) } },
    async (request, response) => {
      const { user } = request.session;

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { role: true, shift: true },
      });

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

      if (!post || !userData || userData.shift !== post.shift) {
        return response.status(StatusCodes.NOT_FOUND).send();
      }

      const liked = post.likes.length > 0;
      const likeCount = post._count.likes;
      const filteredPost = {
        id: post.id,
        title: post.title,
        content: post.content,
        imageId: post.imageId,
        published: post.published,
        createdAt: post.createdAt,
      };

      return response.send(
        createSuccessResponse({ post: filteredPost, liked, likeCount }),
      );
    },
  );
};

type SearchOptions = {
  shift: number;
  published: boolean;
  hidden: boolean;
  authorId?: string;
  likes?: { some: { userId: string } };
};

export const fetchPosts = async (
  searchOptions: SearchOptions,
  pageSize: number,
  pageNumber: number,
) => {
  const postCount = await prisma.post.count({
    where: searchOptions,
  });
  const totalPages = Math.ceil(postCount / pageSize);

  return {
    posts: await prisma.post.findMany({
      where: searchOptions,
      orderBy: { createdAt: "desc" },
      skip: pageSize * (pageNumber - 1),
      take: pageSize,
    }),
    totalPages,
  };
};

export default postsRoute;

import "dotenv/config";

import fp from "fastify-plugin";
import fastifySession from "@fastify/session";
import fastifyCookie from "@fastify/cookie";
import { PrismaSessionStore } from "@quixo3/prisma-session-store";

import type { Auth } from "../../schemas/auth.js";

declare module "fastify" {
  interface Session {
    user: Auth;
  }
}

export default fp(
  async (fastify) => {
    const sessionSecret = process.env.COOKIE_SECRET;
    const cookieDomain = process.env.COOKIE_DOMAIN;

    if (!sessionSecret) {
      throw new Error("Could not find session secret");
    }

    const defaultTTL = 1000 * 60 * 60 * 24 * 3;

    fastify.register(fastifyCookie);
    fastify.register(fastifySession, {
      secret: sessionSecret,
      cookie: {
        secure: "auto",
        domain: cookieDomain,
        sameSite: "lax",
        httpOnly: true,
        maxAge: defaultTTL,
      },
      saveUninitialized: false,
      rolling: true, // Constantly update the cookie, allowing for shorter TTL.
      store: new PrismaSessionStore(fastify.prisma, {
        checkPeriod: defaultTTL,
        dbRecordIdIsSessionId: true,
        dbRecordIdFunction: undefined,
      }) as any,
      // Cast to any due to a weird type bug.
      // https://github.com/kleydon/prisma-session-store/issues/111
      // https://github.com/kleydon/prisma-session-store/issues/105
    });
  },
  { name: "session" },
);

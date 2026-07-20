import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);

// Make prisma available as a standard import for use in services and utils.
// Not everything has access to the plugin.
// TODO: find a more elegant way to accomplish this.
// The current approach seems to be a Fastify antipattern.
const prisma = new PrismaClient({ adapter });

export default prisma;

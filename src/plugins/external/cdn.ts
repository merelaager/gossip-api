import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import * as BunnyStorageSDK from "@bunny.net/storage-sdk";

declare module "fastify" {
  interface FastifyInstance {
    uploadToCDN: (filePath: string, fileName: string) => Promise<boolean>;
  }
}

const cdnPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const sz_zone = process.env.CDN_STORAGE_ZONE!;
  const access_key = process.env.CDN_STORAGE_ACCESS_KEY!;

  const sz = BunnyStorageSDK.zone.connect_with_accesskey(
    BunnyStorageSDK.regions.StorageRegion.Falkenstein,
    sz_zone,
    access_key,
  );

  fastify.decorate(
    "uploadToCDN",
    async (filePath: string, fileName: string) => {
      const nodeStream = createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);
      return BunnyStorageSDK.file.upload(sz, `/gossip/${fileName}`, webStream);
    },
  );
});

export default cdnPlugin;

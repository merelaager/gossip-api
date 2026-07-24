import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    uploadToStream: (filePath: string, title: string) => Promise<string | null>;
  }
}

const STREAM_BASE_URL = "https://video.bunnycdn.com";

const streamPlugin: FastifyPluginAsync = fp(async (fastify) => {
  const libraryId = process.env.CDN_STREAM_LIBRARY_ID!;
  const apiKey = process.env.CDN_STREAM_API_KEY!;
  const collectionId = process.env.CDN_STREAM_COLLECTION_ID;

  const deleteVideo = async (guid: string) => {
    try {
      await fetch(`${STREAM_BASE_URL}/library/${libraryId}/videos/${guid}`, {
        method: "DELETE",
        headers: { AccessKey: apiKey },
      });
    } catch (err) {
      fastify.log.error(
        { err, guid },
        "Bunny Stream: failed to clean up video",
      );
    }
  };

  fastify.decorate(
    "uploadToStream",
    async (filePath: string, title: string): Promise<string | null> => {
      const createResponse = await fetch(
        `${STREAM_BASE_URL}/library/${libraryId}/videos`,
        {
          method: "POST",
          headers: {
            AccessKey: apiKey,
            "Content-Type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(
            collectionId ? { title, collectionId } : { title },
          ),
        },
      );

      if (!createResponse.ok) {
        fastify.log.error(
          {
            status: createResponse.status,
            body: await createResponse.text(),
          },
          "Bunny Stream: failed to create video",
        );
        return null;
      }

      const { guid } = (await createResponse.json()) as { guid: string };

      const nodeStream = createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);
      const uploadResponse = await fetch(
        `${STREAM_BASE_URL}/library/${libraryId}/videos/${guid}`,
        {
          method: "PUT",
          headers: { AccessKey: apiKey },
          body: webStream,
          duplex: "half",
        } as RequestInit & { duplex: "half" },
      );

      if (!uploadResponse.ok) {
        fastify.log.error(
          {
            status: uploadResponse.status,
            guid,
            body: await uploadResponse.text(),
          },
          "Bunny Stream: failed to upload video bytes",
        );
        await deleteVideo(guid);
        return null;
      }

      return guid;
    },
  );
});

export default streamPlugin;

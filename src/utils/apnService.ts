import apn from "@parse/node-apn";
import "dotenv/config";

import { TokenType } from "@prisma/client";
import prisma from "./prisma.js";

const APN_KEY = process.env.APN_KEY_FILE!;
const APN_KEY_ID = process.env.APN_KEY_ID!;
const APN_TEAM_ID = process.env.APN_TEAM_ID!;

const NOTIFICATION_DURATION_SECONDS = 60 * 60 * 6;

export const APN_PRODUCTION = process.env.APN_PRODUCTION === "true";

export const APN_TOKEN_TYPE: TokenType = APN_PRODUCTION
  ? TokenType.PROD
  : TokenType.DEV;

const apnProvider = new apn.Provider({
  token: {
    key: `keys/${APN_KEY}`,
    keyId: APN_KEY_ID,
    teamId: APN_TEAM_ID,
  },
  production: APN_PRODUCTION,
});

export const sendNotificationToTokens = async (
  tokens: string[],
  postId: string,
  title: string,
  message: string,
) => {
  const notification = new apn.Notification({
    title: title,
    body: message,
    topic: "ee.merelaager.Gossip",
    payload: {
      postId: postId,
      expiry: Math.floor(Date.now() / 1000) + NOTIFICATION_DURATION_SECONDS,
    },
  });

  try {
    const result = await apnProvider.send(notification, tokens);

    const invalidTokens: string[] = [];

    result.failed.forEach((failure) => {
      console.error(
        `APN delivery failed for ${failure.device}: ${
          failure.response?.reason ??
          failure.error ??
          `status ${failure.status}`
        }`,
      );

      if (Number(failure.status) === 410) {
        invalidTokens.push(failure.device);
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.appleToken.deleteMany({
        where: { id: { in: invalidTokens } },
      });
    }

    return;
  } catch (err) {
    console.error(err);
    return;
  }
};

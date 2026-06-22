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

const QUIET_HOURS_TIMEZONE = "Europe/Tallinn";
const QUIET_HOURS_START = "22:30";
const QUIET_HOURS_END = "09:30";

const isWithinQuietHours = () => {
  const currentTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: QUIET_HOURS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  return currentTime >= QUIET_HOURS_START || currentTime < QUIET_HOURS_END;
};

export const canDeliverApprovedPostNotification = () =>
  !APN_PRODUCTION || !isWithinQuietHours();

const MODERATION_QUEUE_COLLAPSE_ID = "mod-queue";

const deliver = async (notification: apn.Notification, tokens: string[]) => {
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
  } catch (err) {
    console.error(err);
  }
};

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
    expiry: Math.floor(Date.now() / 1000) + NOTIFICATION_DURATION_SECONDS,
    payload: {
      postId: postId,
    },
  });

  await deliver(notification, tokens);
};

export const sendModerationQueueNotification = async (
  tokens: string[],
  queueLength: number,
) => {
  const postWord = queueLength === 1 ? "postitus" : "postitust";

  const notification = new apn.Notification({
    title: "Postitused ootel",
    body: `${queueLength} ${postWord} ootab ülevaatust`,
    topic: "ee.merelaager.Gossip",
    collapseId: MODERATION_QUEUE_COLLAPSE_ID,
    badge: queueLength,
    expiry: Math.floor(Date.now() / 1000) + NOTIFICATION_DURATION_SECONDS,
    payload: {
      type: "moderation",
    },
  });

  await deliver(notification, tokens);
};

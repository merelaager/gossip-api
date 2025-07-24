import apn from "@parse/node-apn";
import "dotenv/config";

const APN_KEY = process.env.APN_KEY_FILE!;
const APN_KEY_ID = process.env.APN_KEY_ID!;
const APN_TEAM_ID = process.env.APN_TEAM_ID!;

const APN_PRODUCTION = process.env.APN_PRODUCTION
  ? process.env.APN_PRODUCTION === "true"
  : true;

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
      postId: postId
    },
  });

  try {
    await apnProvider.send(notification, tokens);
  } catch (err) {
    console.error(err);
  }
};

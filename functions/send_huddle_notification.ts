import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { type Locale, t } from "../i18n/mod.ts";

export const SendHuddleNotificationFunctionDefinition = DefineFunction({
  callback_id: "send_huddle_notification",
  title: "Send huddle notification",
  description:
    "Sends a reminder to all participants when it's time for a huddle",
  source_file: "functions/send_huddle_notification.ts",
  input_parameters: {
    properties: {
      booking_id: { type: Schema.types.string },
    },
    required: ["booking_id"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  SendHuddleNotificationFunctionDefinition,
  async ({ inputs, client }) => {
    const getResponse = await client.apps.datastore.get({
      datastore: "HuddleBookings",
      id: inputs.booking_id,
    });

    if (!getResponse.ok) {
      if (getResponse.error === "datastore_item_not_found") {
        return { outputs: {} };
      }
      return { error: `Could not read booking: ${getResponse.error}` };
    }

    const booking = getResponse.item;

    if (!booking?.title || booking.status !== "active") {
      return { outputs: {} };
    }

    const locale: Locale = booking.creator_locale ?? "en";
    const participants: string[] = JSON.parse(booking.participants_json);
    const participantMentions = participants.map((id: string) => `<@${id}>`)
      .join(" ");

    const postResponse = await client.chat.postMessage({
      channel: booking.channel_id,
      text: t(locale, "notification.fallback", {
        title: booking.title,
        mentions: participantMentions,
      }),
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: t(locale, "notification.header"),
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: t(locale, "notification.body", {
              title: booking.title,
              mentions: participantMentions,
            }),
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: t(locale, "notification.footer", {
                creator: booking.creator_id,
              }),
            },
          ],
        },
      ],
    });

    if (!postResponse.ok) {
      return {
        error: t(locale, "error.send_notification", {
          error: String(postResponse.error),
        }),
      };
    }

    // Only mark as completed for one-time bookings
    const recurrenceType = booking.recurrence_type ?? "once";
    if (recurrenceType === "once") {
      const putResponse = await client.apps.datastore.put({
        datastore: "HuddleBookings",
        item: { ...booking, status: "completed" },
      });

      if (!putResponse.ok) {
        return {
          error: t(locale, "error.update_booking", {
            error: String(putResponse.error),
          }),
        };
      }
    }

    return { outputs: {} };
  },
);

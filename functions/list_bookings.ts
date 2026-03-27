import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  detectLocale,
  dmReminderLabel,
  recurrenceLabel,
  t,
} from "../i18n/mod.ts";

export const ListBookingsFunctionDefinition = DefineFunction({
  callback_id: "list_bookings",
  title: "List bookings",
  description: "Lists upcoming huddle bookings for a channel",
  source_file: "functions/list_bookings.ts",
  input_parameters: {
    properties: {
      channel_id: { type: Schema.slack.types.channel_id },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["channel_id", "user_id"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  ListBookingsFunctionDefinition,
  async ({ inputs, client }) => {
    const locale = await detectLocale(client, inputs.user_id);

    const queryResponse = await client.apps.datastore.query({
      datastore: "HuddleBookings",
      expression: "#status = :active",
      expression_attributes: { "#status": "status" },
      expression_values: { ":active": "active" },
    });

    if (!queryResponse.ok) {
      return {
        error: t(locale, "error.query_bookings", {
          error: String(queryResponse.error),
        }),
      };
    }

    const now = new Date();
    const bookings = queryResponse.items
      .filter((b: Record<string, string>) => {
        if (b.channel_id !== inputs.channel_id) return false;
        const recurrence = b.recurrence_type ?? "once";
        if (recurrence !== "once") return true;
        const scheduledDate = new Date(
          `${b.scheduled_date}T${b.scheduled_time}:00`,
        );
        return scheduledDate.getTime() > now.getTime();
      })
      .sort((a: Record<string, string>, b: Record<string, string>) => {
        const dateA = `${a.scheduled_date}T${a.scheduled_time}`;
        const dateB = `${b.scheduled_date}T${b.scheduled_time}`;
        return dateA.localeCompare(dateB);
      });

    if (bookings.length === 0) {
      const postResponse = await client.chat.postMessage({
        channel: inputs.channel_id,
        text: t(locale, "list.empty"),
      });
      if (!postResponse.ok) {
        return {
          error: t(locale, "error.send_message", {
            error: String(postResponse.error),
          }),
        };
      }
      return { outputs: {} };
    }

    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: { type: "plain_text", text: t(locale, "list.header") },
      },
    ];

    for (const booking of bookings) {
      const participants: string[] = JSON.parse(booking.participants_json);
      const participantMentions = participants.map((id: string) => `<@${id}>`)
        .join(", ");
      const recurrence = booking.recurrence_type ?? "once";
      const recSuffix = recurrence !== "once"
        ? ` (${recurrenceLabel(locale, recurrence)})`
        : "";
      const dmMinutes = booking.dm_reminder_minutes ?? "0";
      const dmSuffix = dmMinutes !== "0"
        ? `\n:bell: ${dmReminderLabel(locale, dmMinutes)}`
        : "";

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*${booking.title}*\n:calendar: ${booking.scheduled_date} kl ${booking.scheduled_time}${recSuffix}\n:busts_in_silhouette: ${participantMentions}\n:bust_in_silhouette: ${
              t(locale, "notification.footer", { creator: booking.creator_id })
            }${dmSuffix}\nID: \`${booking.id}\``,
        },
      });
      blocks.push({ type: "divider" });
    }

    const count = bookings.length;
    const countKey = count === 1 ? "list.count_one" : "list.count_many";
    const fallbackKey = count === 1
      ? "list.fallback_one"
      : "list.fallback_many";

    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: t(locale, countKey, { count: String(count) }) },
      ],
    });

    const postResponse = await client.chat.postMessage({
      channel: inputs.channel_id,
      text: t(locale, fallbackKey, { count: String(count) }),
      blocks,
    });

    if (!postResponse.ok) {
      return {
        error: t(locale, "error.send_message", {
          error: String(postResponse.error),
        }),
      };
    }

    return { outputs: {} };
  },
);

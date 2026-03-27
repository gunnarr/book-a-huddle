import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { type Locale, t } from "../i18n/mod.ts";

export const SendDmRemindersFunctionDefinition = DefineFunction({
  callback_id: "send_dm_reminders",
  title: "Send DM reminders",
  description: "Sends a DM reminder to each participant before a huddle",
  source_file: "functions/send_dm_reminders.ts",
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
  SendDmRemindersFunctionDefinition,
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

    for (const userId of participants) {
      await client.chat.postMessage({
        channel: userId,
        text: t(locale, "dm_reminder.message", {
          title: booking.title,
          time: booking.scheduled_time,
          channel: booking.channel_id,
        }),
      });
    }

    return { outputs: {} };
  },
);

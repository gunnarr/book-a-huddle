import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { detectLocale, t } from "../i18n/mod.ts";

export const CancelBookingFunctionDefinition = DefineFunction({
  callback_id: "cancel_booking",
  title: "Cancel huddle",
  description: "Cancels a scheduled huddle",
  source_file: "functions/cancel_booking.ts",
  input_parameters: {
    properties: {
      booking_id: { type: Schema.types.string },
      user_id: { type: Schema.slack.types.user_id },
    },
    required: ["booking_id", "user_id"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  CancelBookingFunctionDefinition,
  async ({ inputs, client }) => {
    const locale = await detectLocale(client, inputs.user_id);

    const getResponse = await client.apps.datastore.get({
      datastore: "HuddleBookings",
      id: inputs.booking_id,
    });

    if (!getResponse.ok || !getResponse.item?.title) {
      const postResponse = await client.chat.postMessage({
        channel: inputs.user_id,
        text: t(locale, "cancel.not_found", { id: inputs.booking_id }),
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

    const booking = getResponse.item;

    if (booking.status === "cancelled") {
      await client.chat.postMessage({
        channel: inputs.user_id,
        text: t(locale, "cancel.already_cancelled", { title: booking.title }),
      });
      return { outputs: {} };
    }

    if (booking.creator_id !== inputs.user_id) {
      await client.chat.postMessage({
        channel: inputs.user_id,
        text: t(locale, "cancel.not_creator"),
      });
      return { outputs: {} };
    }

    // Delete main trigger (best effort)
    await client.workflows.triggers.delete({
      trigger_id: booking.trigger_id,
    });

    // Delete DM trigger if present (best effort)
    if (booking.dm_trigger_id) {
      await client.workflows.triggers.delete({
        trigger_id: booking.dm_trigger_id,
      });
    }

    const putResponse = await client.apps.datastore.put({
      datastore: "HuddleBookings",
      item: { ...booking, status: "cancelled" },
    });

    if (!putResponse.ok) {
      return {
        error: t(locale, "error.update_booking", {
          error: String(putResponse.error),
        }),
      };
    }

    const postResponse = await client.chat.postMessage({
      channel: booking.channel_id,
      text: t(locale, "cancel.confirmation", {
        title: booking.title,
        date: booking.scheduled_date,
        time: booking.scheduled_time,
        user: inputs.user_id,
      }),
    });

    if (!postResponse.ok) {
      return {
        error: t(locale, "error.send_confirmation", {
          error: String(postResponse.error),
        }),
      };
    }

    return { outputs: {} };
  },
);

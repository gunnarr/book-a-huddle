import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import {
  detectLocale,
  dmReminderLabel,
  type Locale,
  recurrenceLabel,
  t,
} from "../i18n/mod.ts";

export const SaveBookingFunctionDefinition = DefineFunction({
  callback_id: "save_booking",
  title: "Save booking",
  description: "Saves a huddle booking and creates a scheduled reminder",
  source_file: "functions/save_booking.ts",
  input_parameters: {
    properties: {
      title: { type: Schema.types.string },
      channel_id: { type: Schema.slack.types.channel_id },
      participants: {
        type: Schema.types.array,
        items: { type: Schema.slack.types.user_id },
      },
      date: { type: Schema.slack.types.date },
      time: { type: Schema.types.string },
      creator_id: { type: Schema.slack.types.user_id },
      recurrence_type: { type: Schema.types.string },
      dm_reminder_minutes: { type: Schema.types.string },
    },
    required: [
      "title",
      "channel_id",
      "participants",
      "date",
      "time",
      "creator_id",
      "recurrence_type",
      "dm_reminder_minutes",
    ],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export function deriveWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

export function subtractMinutes(
  dateStr: string,
  timeStr: string,
  minutes: number,
): string {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  d.setMinutes(d.getMinutes() - minutes);
  const iso = d.toISOString();
  return iso.slice(0, 19);
}

function buildFrequency(
  recurrenceType: string,
  date: string,
): Record<string, unknown> {
  if (recurrenceType === "daily") {
    return { type: "daily", repeats_every: 1 };
  }
  if (recurrenceType === "weekly") {
    return {
      type: "weekly",
      on_days: [deriveWeekday(date)],
      repeats_every: 1,
    };
  }
  return { type: "once" };
}

function buildEndTime(recurrenceType: string, dateStr: string): string | null {
  if (recurrenceType === "once") return null;
  const d = new Date(dateStr + "T23:59:59");
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 19);
}

export default SlackFunction(
  SaveBookingFunctionDefinition,
  async ({ inputs, client }) => {
    const {
      title,
      channel_id,
      participants,
      date,
      time,
      creator_id,
      recurrence_type,
      dm_reminder_minutes,
    } = inputs;

    const locale: Locale = await detectLocale(client, creator_id);

    // Step 1: Validate future time
    const scheduledISO = `${date}T${time}:00`;
    const scheduledDate = new Date(scheduledISO);
    const now = new Date();

    if (scheduledDate.getTime() <= now.getTime()) {
      const postResponse = await client.chat.postMessage({
        channel: channel_id,
        text: t(locale, "validation.past_time"),
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

    // Step 2: Generate booking ID
    const bookingId = crypto.randomUUID();

    // Step 3: Create main scheduled trigger
    const frequency = buildFrequency(recurrence_type, date);
    const endTime = buildEndTime(recurrence_type, date);

    // deno-lint-ignore no-explicit-any
    const schedule: any = {
      start_time: scheduledISO,
      timezone: "Europe/Stockholm",
      frequency,
    };
    if (endTime) schedule.end_time = endTime;

    const triggerResponse = await client.workflows.triggers.create({
      type: TriggerTypes.Scheduled,
      name: `Huddle: ${title}`,
      workflow: "#/workflows/notify_huddle",
      inputs: { booking_id: { value: bookingId } },
      schedule,
    });

    if (!triggerResponse.ok) {
      return {
        error: t(locale, "error.create_trigger", {
          error: String(triggerResponse.error),
        }),
      };
    }

    const triggerId = triggerResponse.trigger.id;

    // Step 4: Create DM reminder trigger (if enabled)
    let dmTriggerId = "";
    if (dm_reminder_minutes !== "0") {
      const dmStartTime = subtractMinutes(
        date,
        time,
        parseInt(dm_reminder_minutes),
      );
      // deno-lint-ignore no-explicit-any
      const dmSchedule: any = {
        start_time: dmStartTime,
        timezone: "Europe/Stockholm",
        frequency,
      };
      if (endTime) dmSchedule.end_time = endTime;

      const dmTriggerResponse = await client.workflows.triggers.create({
        type: TriggerTypes.Scheduled,
        name: `DM: ${title}`,
        workflow: "#/workflows/dm_reminder",
        inputs: { booking_id: { value: bookingId } },
        schedule: dmSchedule,
      });

      if (dmTriggerResponse.ok) {
        dmTriggerId = dmTriggerResponse.trigger.id;
      }
    }

    // Step 5: Save booking to datastore
    const putResponse = await client.apps.datastore.put({
      datastore: "HuddleBookings",
      item: {
        id: bookingId,
        title,
        channel_id,
        creator_id,
        participants_json: JSON.stringify(participants),
        scheduled_date: date,
        scheduled_time: time,
        trigger_id: triggerId,
        status: "active",
        created_at: new Date().toISOString(),
        recurrence_type,
        dm_reminder_minutes,
        dm_trigger_id: dmTriggerId,
        creator_locale: locale,
      },
    });

    if (!putResponse.ok) {
      await client.workflows.triggers.delete({ trigger_id: triggerId });
      if (dmTriggerId) {
        await client.workflows.triggers.delete({ trigger_id: dmTriggerId });
      }
      return {
        error: t(locale, "error.save_booking", {
          error: String(putResponse.error),
        }),
      };
    }

    // Step 6: Post confirmation
    const participantMentions = participants.map((id: string) => `<@${id}>`)
      .join(", ");
    const recLabel = recurrenceLabel(locale, recurrence_type);
    const dmLabel = dmReminderLabel(locale, dm_reminder_minutes);

    const fields = [
      {
        type: "mrkdwn",
        text: `*${t(locale, "booking.confirmed.title_label")}:*\n${title}`,
      },
      {
        type: "mrkdwn",
        text: `*${
          t(locale, "booking.confirmed.channel_label")
        }:*\n<#${channel_id}>`,
      },
      {
        type: "mrkdwn",
        text: `*${t(locale, "booking.confirmed.date_label")}:*\n${date}`,
      },
      {
        type: "mrkdwn",
        text: `*${t(locale, "booking.confirmed.time_label")}:*\n${time}`,
      },
    ];

    if (recurrence_type !== "once") {
      fields.push({
        type: "mrkdwn",
        text: `*${
          t(locale, "booking.confirmed.recurrence_label")
        }:*\n${recLabel}`,
      });
    }

    if (dm_reminder_minutes !== "0") {
      fields.push({
        type: "mrkdwn",
        text: `*${
          t(locale, "booking.confirmed.dm_reminder_label")
        }:*\n${dmLabel}`,
      });
    }

    const postResponse = await client.chat.postMessage({
      channel: channel_id,
      text: t(locale, "booking.confirmed.fallback", { title, date, time }),
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: t(locale, "booking.confirmed.header"),
          },
        },
        { type: "section", fields },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${
              t(locale, "booking.confirmed.participants_label")
            }:*\n${participantMentions}`,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: t(locale, "booking.confirmed.footer", {
                creator: creator_id,
                id: bookingId,
              }),
            },
          ],
        },
      ],
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

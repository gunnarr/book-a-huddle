import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import { detectLocale, type Locale, t } from "../i18n/mod.ts";
import { deriveWeekday, subtractMinutes } from "./save_booking.ts";

export const EditBookingFunctionDefinition = DefineFunction({
  callback_id: "edit_booking",
  title: "Edit huddle",
  description: "Edits an existing huddle booking via modal",
  source_file: "functions/edit_booking.ts",
  input_parameters: {
    properties: {
      booking_id: { type: Schema.types.string },
      interactivity: { type: Schema.slack.types.interactivity },
    },
    required: ["booking_id", "interactivity"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

const TIME_OPTIONS = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
];

const RECURRENCE_OPTIONS = [
  { value: "once", sv: "En gång", en: "One-time" },
  { value: "daily", sv: "Dagligen", en: "Daily" },
  { value: "weekly", sv: "Varje vecka", en: "Weekly" },
];

const DM_OPTIONS = [
  { value: "0", sv: "Nej", en: "No" },
  { value: "5", sv: "5 min innan", en: "5 min before" },
  { value: "10", sv: "10 min innan", en: "10 min before" },
  { value: "15", sv: "15 min innan", en: "15 min before" },
  { value: "30", sv: "30 min innan", en: "30 min before" },
];

function makeOption(value: string, text: string) {
  return { text: { type: "plain_text" as const, text }, value };
}

function buildModalBlocks(
  booking: Record<string, string>,
  participants: string[],
  locale: Locale,
) {
  const recurrence = booking.recurrence_type ?? "once";
  const dmMinutes = booking.dm_reminder_minutes ?? "0";

  return [
    {
      type: "input",
      block_id: "title_block",
      element: {
        type: "plain_text_input",
        action_id: "title",
        initial_value: booking.title,
      },
      label: { type: "plain_text", text: t(locale, "edit.title_label") },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: t(locale, "edit.channel_info", {
            channel: booking.channel_id,
          }),
        },
      ],
    },
    {
      type: "input",
      block_id: "participants_block",
      element: {
        type: "multi_users_select",
        action_id: "participants",
        initial_users: participants,
      },
      label: {
        type: "plain_text",
        text: t(locale, "edit.participants_label"),
      },
    },
    {
      type: "input",
      block_id: "date_block",
      element: {
        type: "datepicker",
        action_id: "date",
        initial_date: booking.scheduled_date,
      },
      label: { type: "plain_text", text: t(locale, "edit.date_label") },
    },
    {
      type: "input",
      block_id: "time_block",
      element: {
        type: "static_select",
        action_id: "time",
        options: TIME_OPTIONS.map((v) => makeOption(v, v)),
        initial_option: makeOption(
          booking.scheduled_time,
          booking.scheduled_time,
        ),
      },
      label: { type: "plain_text", text: t(locale, "edit.time_label") },
    },
    {
      type: "input",
      block_id: "recurrence_block",
      element: {
        type: "static_select",
        action_id: "recurrence_type",
        options: RECURRENCE_OPTIONS.map((o) =>
          makeOption(o.value, locale === "en" ? o.en : o.sv)
        ),
        initial_option: makeOption(
          recurrence,
          RECURRENCE_OPTIONS.find((o) => o.value === recurrence)?.[locale] ??
            recurrence,
        ),
      },
      label: {
        type: "plain_text",
        text: t(locale, "edit.recurrence_label"),
      },
    },
    {
      type: "input",
      block_id: "dm_block",
      element: {
        type: "static_select",
        action_id: "dm_reminder_minutes",
        options: DM_OPTIONS.map((o) =>
          makeOption(o.value, locale === "en" ? o.en : o.sv)
        ),
        initial_option: makeOption(
          dmMinutes,
          DM_OPTIONS.find((o) => o.value === dmMinutes)?.[locale] ?? dmMinutes,
        ),
      },
      label: {
        type: "plain_text",
        text: t(locale, "edit.dm_reminder_label"),
      },
    },
  ];
}

export default SlackFunction(
  EditBookingFunctionDefinition,
  async ({ inputs, client }) => {
    const locale = await detectLocale(
      client,
      inputs.interactivity.interactor.id,
    );

    const getResponse = await client.apps.datastore.get({
      datastore: "HuddleBookings",
      id: inputs.booking_id,
    });

    if (!getResponse.ok || !getResponse.item?.title) {
      await client.chat.postMessage({
        channel: inputs.interactivity.interactor.id,
        text: t(locale, "edit.not_found", { id: inputs.booking_id }),
      });
      return { completed: true, outputs: {} };
    }

    const booking = getResponse.item;

    if (booking.creator_id !== inputs.interactivity.interactor.id) {
      await client.chat.postMessage({
        channel: inputs.interactivity.interactor.id,
        text: t(locale, "edit.not_creator"),
      });
      return { completed: true, outputs: {} };
    }

    if (booking.status !== "active") {
      await client.chat.postMessage({
        channel: inputs.interactivity.interactor.id,
        text: t(locale, "edit.not_found", { id: inputs.booking_id }),
      });
      return { completed: true, outputs: {} };
    }

    const participants: string[] = JSON.parse(booking.participants_json);

    const viewResponse = await client.views.open({
      interactivity_pointer: inputs.interactivity.interactivity_pointer,
      view: {
        type: "modal",
        callback_id: "edit_booking_modal",
        private_metadata: JSON.stringify({
          booking_id: booking.id,
          channel_id: booking.channel_id,
          old_trigger_id: booking.trigger_id,
          old_dm_trigger_id: booking.dm_trigger_id ?? "",
          locale,
        }),
        title: {
          type: "plain_text",
          text: t(locale, "edit.modal_title"),
        },
        submit: {
          type: "plain_text",
          text: t(locale, "edit.submit_label"),
        },
        blocks: buildModalBlocks(booking, participants, locale),
      },
    });

    if (!viewResponse.ok) {
      return { error: `Could not open modal: ${viewResponse.error}` };
    }

    return { completed: false };
  },
)
  .addViewSubmissionHandler(
    ["edit_booking_modal"],
    async ({ view, body, client }) => {
      const meta = JSON.parse(view.private_metadata!);
      const locale: Locale = meta.locale ?? "en";
      const vals = view.state.values;

      const newTitle = vals.title_block.title.value;
      const newDate = vals.date_block.date.selected_date;
      const newTime = vals.time_block.time.selected_option.value;
      const newParticipants =
        vals.participants_block.participants.selected_users;
      const newRecurrence =
        vals.recurrence_block.recurrence_type.selected_option.value;
      const newDmMinutes =
        vals.dm_block.dm_reminder_minutes.selected_option.value;

      // Delete old triggers (best effort)
      await client.workflows.triggers.delete({
        trigger_id: meta.old_trigger_id,
      });
      if (meta.old_dm_trigger_id) {
        await client.workflows.triggers.delete({
          trigger_id: meta.old_dm_trigger_id,
        });
      }

      // Create new main trigger
      const scheduledISO = `${newDate}T${newTime}:00`;
      const endTime = newRecurrence !== "once"
        ? buildEndTimeForEdit(newDate)
        : null;

      const frequency = buildFrequencyObj(newRecurrence, newDate);
      const schedule: Record<string, unknown> = {
        start_time: scheduledISO,
        timezone: "Europe/Stockholm",
        frequency,
      };
      if (endTime) schedule.end_time = endTime;

      const triggerResponse = await client.apiCall(
        "workflows.triggers.create",
        {
          type: TriggerTypes.Scheduled,
          name: `Huddle: ${newTitle}`,
          workflow: "#/workflows/notify_huddle",
          inputs: { booking_id: { value: meta.booking_id } },
          schedule,
        },
      );

      const newTriggerId = triggerResponse.ok
        ? (triggerResponse as Record<string, Record<string, string>>).trigger.id
        : "";

      // Create new DM trigger if enabled
      let newDmTriggerId = "";
      if (newDmMinutes !== "0") {
        const dmStartTime = subtractMinutes(
          newDate,
          newTime,
          parseInt(newDmMinutes),
        );
        const dmSchedule: Record<string, unknown> = {
          start_time: dmStartTime,
          timezone: "Europe/Stockholm",
          frequency,
        };
        if (endTime) dmSchedule.end_time = endTime;

        const dmResp = await client.apiCall("workflows.triggers.create", {
          type: TriggerTypes.Scheduled,
          name: `DM: ${newTitle}`,
          workflow: "#/workflows/dm_reminder",
          inputs: { booking_id: { value: meta.booking_id } },
          schedule: dmSchedule,
        });
        if (dmResp.ok) {
          newDmTriggerId =
            (dmResp as Record<string, Record<string, string>>).trigger.id;
        }
      }

      // Update datastore
      await client.apps.datastore.put({
        datastore: "HuddleBookings",
        item: {
          id: meta.booking_id,
          title: newTitle,
          channel_id: meta.channel_id,
          creator_id: body.user.id,
          participants_json: JSON.stringify(newParticipants),
          scheduled_date: newDate,
          scheduled_time: newTime,
          trigger_id: newTriggerId,
          status: "active",
          recurrence_type: newRecurrence,
          dm_reminder_minutes: newDmMinutes,
          dm_trigger_id: newDmTriggerId,
          creator_locale: locale,
        },
      });

      // Post confirmation
      await client.chat.postMessage({
        channel: meta.channel_id,
        text: t(locale, "edit.success", { title: newTitle }),
      });

      await client.functions.completeSuccess({
        function_execution_id: body.function_data.execution_id,
        outputs: {},
      });
    },
  )
  .addViewClosedHandler(
    ["edit_booking_modal"],
    async ({ body, client }) => {
      await client.functions.completeSuccess({
        function_execution_id: body.function_data.execution_id,
        outputs: {},
      });
    },
  );

function buildFrequencyObj(
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

function buildEndTimeForEdit(dateStr: string): string {
  const d = new Date(dateStr + "T23:59:59");
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 19);
}

import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SaveBookingFunctionDefinition } from "../functions/save_booking.ts";

const BookHuddleWorkflow = DefineWorkflow({
  callback_id: "book_huddle",
  title: "Book a huddle",
  description: "Book a scheduled huddle with participants",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
    },
    required: ["interactivity"],
  },
});

const formStep = BookHuddleWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Book a huddle",
    interactivity: BookHuddleWorkflow.inputs.interactivity,
    submit_label: "Book",
    fields: {
      elements: [
        {
          name: "title",
          title: "Title",
          type: Schema.types.string,
          description: "e.g. Sprint planning, Standup, Brainstorm",
        },
        {
          name: "channel_id",
          title: "Channel",
          type: Schema.slack.types.channel_id,
          description: "Which channel should the huddle be in?",
        },
        {
          name: "participants",
          title: "Participants",
          type: Schema.types.array,
          items: { type: Schema.slack.types.user_id },
          description: "Who should join?",
        },
        {
          name: "date",
          title: "Date",
          type: Schema.slack.types.date,
        },
        {
          name: "time",
          title: "Time",
          type: Schema.types.string,
          enum: [
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
          ],
          choices: [
            { value: "08:00", title: "08:00" },
            { value: "08:30", title: "08:30" },
            { value: "09:00", title: "09:00" },
            { value: "09:30", title: "09:30" },
            { value: "10:00", title: "10:00" },
            { value: "10:30", title: "10:30" },
            { value: "11:00", title: "11:00" },
            { value: "11:30", title: "11:30" },
            { value: "12:00", title: "12:00" },
            { value: "12:30", title: "12:30" },
            { value: "13:00", title: "13:00" },
            { value: "13:30", title: "13:30" },
            { value: "14:00", title: "14:00" },
            { value: "14:30", title: "14:30" },
            { value: "15:00", title: "15:00" },
            { value: "15:30", title: "15:30" },
            { value: "16:00", title: "16:00" },
            { value: "16:30", title: "16:30" },
            { value: "17:00", title: "17:00" },
            { value: "17:30", title: "17:30" },
          ],
        },
        {
          name: "recurrence_type",
          title: "Recurrence",
          type: Schema.types.string,
          enum: ["once", "daily", "weekly"],
          choices: [
            { value: "once", title: "One-time" },
            { value: "daily", title: "Daily" },
            { value: "weekly", title: "Weekly" },
          ],
          default: "once",
        },
        {
          name: "dm_reminder_minutes",
          title: "DM reminder",
          type: Schema.types.string,
          enum: ["0", "5", "10", "15", "30"],
          choices: [
            { value: "0", title: "No" },
            { value: "5", title: "5 min before" },
            { value: "10", title: "10 min before" },
            { value: "15", title: "15 min before" },
            { value: "30", title: "30 min before" },
          ],
          default: "0",
        },
      ],
      required: [
        "title",
        "channel_id",
        "participants",
        "date",
        "time",
        "recurrence_type",
        "dm_reminder_minutes",
      ],
    },
  },
);

BookHuddleWorkflow.addStep(SaveBookingFunctionDefinition, {
  title: formStep.outputs.fields.title,
  channel_id: formStep.outputs.fields.channel_id,
  participants: formStep.outputs.fields.participants,
  date: formStep.outputs.fields.date,
  time: formStep.outputs.fields.time,
  creator_id: BookHuddleWorkflow.inputs.interactivity.interactor.id,
  recurrence_type: formStep.outputs.fields.recurrence_type,
  dm_reminder_minutes: formStep.outputs.fields.dm_reminder_minutes,
});

export default BookHuddleWorkflow;

import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

const HuddleBookingsDatastore = DefineDatastore({
  name: "HuddleBookings",
  primary_key: "id",
  attributes: {
    id: {
      type: Schema.types.string,
    },
    title: {
      type: Schema.types.string,
    },
    channel_id: {
      type: Schema.slack.types.channel_id,
    },
    creator_id: {
      type: Schema.slack.types.user_id,
    },
    participants_json: {
      type: Schema.types.string,
    },
    scheduled_date: {
      type: Schema.types.string,
    },
    scheduled_time: {
      type: Schema.types.string,
    },
    trigger_id: {
      type: Schema.types.string,
    },
    status: {
      type: Schema.types.string,
    },
    created_at: {
      type: Schema.types.string,
    },
    recurrence_type: {
      type: Schema.types.string,
    },
    dm_reminder_minutes: {
      type: Schema.types.string,
    },
    dm_trigger_id: {
      type: Schema.types.string,
    },
    creator_locale: {
      type: Schema.types.string,
    },
  },
});

export default HuddleBookingsDatastore;

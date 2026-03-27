import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SendDmRemindersFunctionDefinition } from "../functions/send_dm_reminders.ts";

const DmReminderWorkflow = DefineWorkflow({
  callback_id: "dm_reminder",
  title: "DM reminder",
  description: "Sends a DM reminder before a booked huddle",
  input_parameters: {
    properties: {
      booking_id: { type: Schema.types.string },
    },
    required: ["booking_id"],
  },
});

DmReminderWorkflow.addStep(SendDmRemindersFunctionDefinition, {
  booking_id: DmReminderWorkflow.inputs.booking_id,
});

export default DmReminderWorkflow;

import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SendHuddleNotificationFunctionDefinition } from "../functions/send_huddle_notification.ts";

const NotifyHuddleWorkflow = DefineWorkflow({
  callback_id: "notify_huddle",
  title: "Huddle reminder",
  description: "Sends a reminder when it's time for a booked huddle",
  input_parameters: {
    properties: {
      booking_id: {
        type: Schema.types.string,
      },
    },
    required: ["booking_id"],
  },
});

NotifyHuddleWorkflow.addStep(SendHuddleNotificationFunctionDefinition, {
  booking_id: NotifyHuddleWorkflow.inputs.booking_id,
});

export default NotifyHuddleWorkflow;

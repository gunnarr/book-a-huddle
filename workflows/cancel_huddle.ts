import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { CancelBookingFunctionDefinition } from "../functions/cancel_booking.ts";

const CancelHuddleWorkflow = DefineWorkflow({
  callback_id: "cancel_huddle",
  title: "Cancel huddle",
  description: "Cancel a scheduled huddle",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
    },
    required: ["interactivity"],
  },
});

const formStep = CancelHuddleWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Cancel huddle",
    interactivity: CancelHuddleWorkflow.inputs.interactivity,
    submit_label: "Cancel",
    fields: {
      elements: [
        {
          name: "booking_id",
          title: "Booking ID",
          type: Schema.types.string,
          description:
            'Find the ID via "List bookings" or in the confirmation message',
        },
      ],
      required: ["booking_id"],
    },
  },
);

CancelHuddleWorkflow.addStep(CancelBookingFunctionDefinition, {
  booking_id: formStep.outputs.fields.booking_id,
  user_id: CancelHuddleWorkflow.inputs.interactivity.interactor.id,
});

export default CancelHuddleWorkflow;

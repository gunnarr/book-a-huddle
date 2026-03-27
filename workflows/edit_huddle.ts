import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { EditBookingFunctionDefinition } from "../functions/edit_booking.ts";

const EditHuddleWorkflow = DefineWorkflow({
  callback_id: "edit_huddle",
  title: "Edit huddle",
  description: "Edit a scheduled huddle",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
    },
    required: ["interactivity"],
  },
});

const formStep = EditHuddleWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Edit huddle",
    interactivity: EditHuddleWorkflow.inputs.interactivity,
    submit_label: "Continue",
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

EditHuddleWorkflow.addStep(EditBookingFunctionDefinition, {
  booking_id: formStep.outputs.fields.booking_id,
  interactivity: formStep.outputs.interactivity,
});

export default EditHuddleWorkflow;

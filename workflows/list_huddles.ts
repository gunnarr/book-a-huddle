import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ListBookingsFunctionDefinition } from "../functions/list_bookings.ts";

const ListHuddlesWorkflow = DefineWorkflow({
  callback_id: "list_huddles",
  title: "List bookings",
  description: "Lists upcoming huddle bookings for a channel",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
    },
    required: ["interactivity"],
  },
});

const formStep = ListHuddlesWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "List bookings",
    interactivity: ListHuddlesWorkflow.inputs.interactivity,
    submit_label: "Show",
    fields: {
      elements: [
        {
          name: "channel_id",
          title: "Channel",
          type: Schema.slack.types.channel_id,
          description: "Which channel do you want to see bookings for?",
        },
      ],
      required: ["channel_id"],
    },
  },
);

ListHuddlesWorkflow.addStep(ListBookingsFunctionDefinition, {
  channel_id: formStep.outputs.fields.channel_id,
  user_id: ListHuddlesWorkflow.inputs.interactivity.interactor.id,
});

export default ListHuddlesWorkflow;

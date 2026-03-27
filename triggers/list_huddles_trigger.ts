import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import ListHuddlesWorkflow from "../workflows/list_huddles.ts";

const listHuddlesTrigger: Trigger<typeof ListHuddlesWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "List bookings",
  description: "List upcoming huddle bookings for a channel",
  workflow: `#/workflows/${ListHuddlesWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
  },
};

export default listHuddlesTrigger;

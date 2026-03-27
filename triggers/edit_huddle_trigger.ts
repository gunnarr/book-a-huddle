import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import EditHuddleWorkflow from "../workflows/edit_huddle.ts";

const editHuddleTrigger: Trigger<typeof EditHuddleWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Edit huddle",
  description: "Edit a scheduled huddle",
  workflow: `#/workflows/${EditHuddleWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
  },
};

export default editHuddleTrigger;

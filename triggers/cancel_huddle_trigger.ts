import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import CancelHuddleWorkflow from "../workflows/cancel_huddle.ts";

const cancelHuddleTrigger: Trigger<typeof CancelHuddleWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Cancel huddle",
  description: "Cancel a scheduled huddle",
  workflow: `#/workflows/${CancelHuddleWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
  },
};

export default cancelHuddleTrigger;

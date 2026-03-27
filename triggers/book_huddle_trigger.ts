import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerTypes } from "deno-slack-api/mod.ts";
import BookHuddleWorkflow from "../workflows/book_huddle.ts";

const bookHuddleTrigger: Trigger<typeof BookHuddleWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Book a huddle",
  description: "Book a scheduled huddle with participants",
  workflow: `#/workflows/${BookHuddleWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
  },
};

export default bookHuddleTrigger;

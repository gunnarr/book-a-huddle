import { Manifest } from "deno-slack-sdk/mod.ts";
import BookHuddleWorkflow from "./workflows/book_huddle.ts";
import NotifyHuddleWorkflow from "./workflows/notify_huddle.ts";
import ListHuddlesWorkflow from "./workflows/list_huddles.ts";
import CancelHuddleWorkflow from "./workflows/cancel_huddle.ts";
import EditHuddleWorkflow from "./workflows/edit_huddle.ts";
import DmReminderWorkflow from "./workflows/dm_reminder.ts";
import HuddleBookingsDatastore from "./datastores/huddle_bookings.ts";

export default Manifest({
  name: "Book a Huddle",
  description:
    "Schedule Slack Huddles. Pick a time, channel, and participants — everyone gets notified when it's go time!",
  icon: "assets/default_new_app_icon.png",
  workflows: [
    BookHuddleWorkflow,
    NotifyHuddleWorkflow,
    ListHuddlesWorkflow,
    CancelHuddleWorkflow,
    EditHuddleWorkflow,
    DmReminderWorkflow,
  ],
  outgoingDomains: [],
  datastores: [HuddleBookingsDatastore],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "triggers:write",
    "triggers:read",
    "users:read",
  ],
});

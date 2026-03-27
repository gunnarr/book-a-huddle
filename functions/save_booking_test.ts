import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import handler from "./save_booking.ts";
import { SaveBookingFunctionDefinition } from "./save_booking.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createContext } = SlackFunctionTester(SaveBookingFunctionDefinition);
const TEST_CHANNEL = "C0123TEST";
const TEST_CREATOR = "U0123CREATOR";
const TEST_PARTICIPANTS = ["U0001ALICE", "U0002BOB"];

// A date far in the future to avoid "past time" validation
const FUTURE_DATE = "2099-12-31";
const FUTURE_TIME = "14:00";

// A date in the past
const PAST_DATE = "2020-01-01";
const PAST_TIME = "09:00";

const TEST_TRIGGER_ID = "Ft0123TRIGGER";
const TEST_DM_TRIGGER_ID = "Ft0456DMTRIGGER";

interface ApiResponses {
  "users.info"?: Record<string, unknown>;
  "chat.postMessage"?: Record<string, unknown>;
  "workflows.triggers.create"?: Record<string, unknown>;
  "apps.datastore.put"?: Record<string, unknown>;
  "workflows.triggers.delete"?: Record<string, unknown>;
}

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

function stubFetch(responses: ApiResponses) {
  const calls: FetchCall[] = [];
  let triggerCreateCount = 0;

  const fetchStub = stub(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      const req = url instanceof Request ? url : new Request(url, options);
      const bodyText = await req.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(bodyText);
      } catch {
        const params = new URLSearchParams(bodyText);
        body = Object.fromEntries(params.entries());
      }

      const method = req.url.replace("https://slack.com/api/", "");
      calls.push({ url: method, body });

      if (method === "users.info") {
        return new Response(
          JSON.stringify(
            responses["users.info"] ?? {
              ok: true,
              user: { locale: "en-US" },
            },
          ),
          { status: 200 },
        );
      }
      if (method === "chat.postMessage") {
        return new Response(
          JSON.stringify(
            responses["chat.postMessage"] ?? { ok: true, ts: "1111.2222" },
          ),
          { status: 200 },
        );
      }
      if (method === "workflows.triggers.create") {
        triggerCreateCount++;
        if (responses["workflows.triggers.create"]) {
          return new Response(
            JSON.stringify(responses["workflows.triggers.create"]),
            { status: 200 },
          );
        }
        const triggerId = triggerCreateCount === 1
          ? TEST_TRIGGER_ID
          : TEST_DM_TRIGGER_ID;
        return new Response(
          JSON.stringify({ ok: true, trigger: { id: triggerId } }),
          { status: 200 },
        );
      }
      if (method === "apps.datastore.put") {
        return new Response(
          JSON.stringify(responses["apps.datastore.put"] ?? { ok: true }),
          { status: 200 },
        );
      }
      if (method === "workflows.triggers.delete") {
        return new Response(
          JSON.stringify(
            responses["workflows.triggers.delete"] ?? { ok: true },
          ),
          { status: 200 },
        );
      }

      throw new Error(`Unstubbed API method: ${method}`);
    },
  );

  return { fetchStub, calls };
}

function parsePutItem(putCall: FetchCall): Record<string, string> {
  const rawItem = putCall.body.item;
  if (typeof rawItem === "string") {
    return JSON.parse(rawItem);
  }
  return rawItem as Record<string, string>;
}

function defaultInputs(overrides: Record<string, unknown> = {}) {
  return {
    title: "Sprint-planering",
    channel_id: TEST_CHANNEL,
    participants: TEST_PARTICIPANTS,
    date: FUTURE_DATE,
    time: FUTURE_TIME,
    creator_id: TEST_CREATOR,
    recurrence_type: "once",
    dm_reminder_minutes: "0",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("happy path -- creates trigger, saves booking, posts confirmation", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({ inputs: defaultInputs() }),
    );

    assertEquals(result.error, undefined);

    // Should have called users.info for locale detection
    const usersInfoCall = calls.find((c) => c.url === "users.info");
    assertEquals(usersInfoCall !== undefined, true);

    // Should have created a trigger
    const triggerCall = calls.find(
      (c) => c.url === "workflows.triggers.create",
    );
    assertEquals(triggerCall !== undefined, true);

    // Should have saved to datastore
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    assertEquals(putCall !== undefined, true);
    const item = parsePutItem(putCall!);
    assertEquals(item.title, "Sprint-planering");
    assertEquals(item.channel_id, TEST_CHANNEL);
    assertEquals(item.creator_id, TEST_CREATOR);
    assertEquals(item.status, "active");
    assertEquals(item.trigger_id, TEST_TRIGGER_ID);
    assertEquals(item.recurrence_type, "once");
    assertEquals(item.dm_reminder_minutes, "0");
    assertEquals(item.dm_trigger_id, "");

    const savedParticipants: string[] = JSON.parse(item.participants_json);
    assertEquals(savedParticipants, TEST_PARTICIPANTS);

    // Should have posted confirmation
    const postCall = calls.find((c) => c.url === "chat.postMessage");
    assertEquals(postCall !== undefined, true);
    assertEquals(postCall!.body.channel, TEST_CHANNEL);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("past date -- posts error message, no trigger or save", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({ date: PAST_DATE, time: PAST_TIME }),
      }),
    );

    assertEquals(result.error, undefined);

    // Should have posted an error message
    const postCall = calls.find((c) => c.url === "chat.postMessage");
    assertEquals(postCall !== undefined, true);
    const text = postCall!.body.text as string;
    assertEquals(text.includes("already passed"), true);

    // Should NOT have created trigger or saved
    const triggerCalls = calls.filter(
      (c) => c.url === "workflows.triggers.create",
    );
    assertEquals(triggerCalls.length, 0);
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("trigger creation failure -- returns error, no datastore save", async () => {
  const { fetchStub, calls } = stubFetch({
    "workflows.triggers.create": {
      ok: false,
      error: "trigger_limit_reached",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: defaultInputs({ title: "Test" }) }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not create reminder"),
      true,
    );

    // Should NOT have saved to datastore
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);

    // Should NOT have posted a message
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("datastore save failure -- cleans up trigger and returns error", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.put": {
      ok: false,
      error: "datastore_error",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: defaultInputs({ title: "Test" }) }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not save booking"),
      true,
    );

    // Should have attempted to delete the orphan trigger
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("datastore save failure with DM trigger -- cleans up BOTH triggers", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.put": {
      ok: false,
      error: "datastore_error",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({ dm_reminder_minutes: "15" }),
      }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not save booking"),
      true,
    );

    // Should have attempted to delete BOTH triggers (main + DM)
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 2);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("chat.postMessage failure -- returns error", async () => {
  const { fetchStub } = stubFetch({
    "chat.postMessage": {
      ok: false,
      error: "channel_not_found",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: defaultInputs({ title: "Test" }) }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not send confirmation"),
      true,
    );
  } finally {
    fetchStub.restore();
  }
});

Deno.test("single participant -- correctly stored and mentioned", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({
          title: "1-on-1",
          participants: ["U0001ALICE"],
        }),
      }),
    );

    assertEquals(result.error, undefined);

    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    const item = parsePutItem(putCall!);
    const savedParticipants: string[] = JSON.parse(item.participants_json);
    assertEquals(savedParticipants, ["U0001ALICE"]);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("confirmation message includes Block Kit with all details", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    await handler(
      createContext({
        inputs: defaultInputs({
          title: "Standup",
          participants: ["U0001ALICE", "U0002BOB"],
        }),
      }),
    );

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const rawBlocks = postCall!.body.blocks;
    const blocks =
      (typeof rawBlocks === "string" ? JSON.parse(rawBlocks) : rawBlocks) as {
        text: { text: string };
      }[];

    // Header block
    assertEquals(blocks[0].text.text, ":calendar: Huddle booked!");

    // Fallback text
    const text = postCall!.body.text as string;
    assertEquals(text.includes("Standup"), true);
    assertEquals(text.includes(FUTURE_DATE), true);
    assertEquals(text.includes(FUTURE_TIME), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("recurring daily -- trigger has frequency.type === 'daily'", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({ recurrence_type: "daily" }),
      }),
    );

    assertEquals(result.error, undefined);

    const triggerCall = calls.find(
      (c) => c.url === "workflows.triggers.create",
    );
    assertEquals(triggerCall !== undefined, true);

    const rawSchedule = triggerCall!.body.schedule;
    const schedule = typeof rawSchedule === "string"
      ? JSON.parse(rawSchedule)
      : rawSchedule as Record<string, unknown>;
    const frequency = schedule.frequency as Record<string, unknown>;
    assertEquals(frequency.type, "daily");
    assertEquals(frequency.repeats_every, 1);

    // Datastore should record recurrence_type
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    const item = parsePutItem(putCall!);
    assertEquals(item.recurrence_type, "daily");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("recurring weekly -- trigger has on_days derived from date", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({ recurrence_type: "weekly" }),
      }),
    );

    assertEquals(result.error, undefined);

    const triggerCall = calls.find(
      (c) => c.url === "workflows.triggers.create",
    );
    assertEquals(triggerCall !== undefined, true);

    const rawSchedule = triggerCall!.body.schedule;
    const schedule = typeof rawSchedule === "string"
      ? JSON.parse(rawSchedule)
      : rawSchedule as Record<string, unknown>;
    const frequency = schedule.frequency as Record<string, unknown>;
    assertEquals(frequency.type, "weekly");
    assertEquals(frequency.repeats_every, 1);

    // 2099-12-31 is a Thursday
    const onDays = frequency.on_days as string[];
    assertEquals(onDays.length, 1);
    assertEquals(onDays[0], "Thursday");

    // Datastore should record recurrence_type
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    const item = parsePutItem(putCall!);
    assertEquals(item.recurrence_type, "weekly");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("DM reminder enabled -- creates TWO triggers", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({ dm_reminder_minutes: "15" }),
      }),
    );

    assertEquals(result.error, undefined);

    const triggerCalls = calls.filter(
      (c) => c.url === "workflows.triggers.create",
    );
    assertEquals(triggerCalls.length, 2);

    // First trigger is the main one
    const mainTrigger = triggerCalls[0];
    const rawName0 = mainTrigger.body.name;
    const name0 = typeof rawName0 === "string" ? rawName0 : String(rawName0);
    assertEquals(name0.startsWith("Huddle:"), true);

    // Second trigger is the DM reminder
    const dmTrigger = triggerCalls[1];
    const rawName1 = dmTrigger.body.name;
    const name1 = typeof rawName1 === "string" ? rawName1 : String(rawName1);
    assertEquals(name1.startsWith("DM:"), true);

    // Datastore should record both trigger IDs
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    const item = parsePutItem(putCall!);
    assertEquals(item.trigger_id, TEST_TRIGGER_ID);
    assertEquals(item.dm_trigger_id, TEST_DM_TRIGGER_ID);
    assertEquals(item.dm_reminder_minutes, "15");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("DM reminder disabled -- creates only ONE trigger", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: defaultInputs({ dm_reminder_minutes: "0" }),
      }),
    );

    assertEquals(result.error, undefined);

    const triggerCalls = calls.filter(
      (c) => c.url === "workflows.triggers.create",
    );
    assertEquals(triggerCalls.length, 1);

    // Datastore should have empty dm_trigger_id
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    const item = parsePutItem(putCall!);
    assertEquals(item.dm_trigger_id, "");
    assertEquals(item.dm_reminder_minutes, "0");
  } finally {
    fetchStub.restore();
  }
});

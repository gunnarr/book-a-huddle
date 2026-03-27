import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import handler from "./cancel_booking.ts";
import { CancelBookingFunctionDefinition } from "./cancel_booking.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createContext } = SlackFunctionTester(CancelBookingFunctionDefinition);
const TEST_BOOKING_ID = "booking-abc-123";
const TEST_CHANNEL = "C0123TEST";
const TEST_CREATOR = "U0123CREATOR";
const TEST_OTHER_USER = "U9999OTHER";

function makeBookingItem(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_BOOKING_ID,
    title: "Sprint-planering",
    channel_id: TEST_CHANNEL,
    creator_id: TEST_CREATOR,
    participants_json: JSON.stringify(["U0001ALICE", "U0002BOB"]),
    scheduled_date: "2099-12-31",
    scheduled_time: "14:00",
    trigger_id: "Ft0123TRIGGER",
    status: "active",
    created_at: "2026-03-26T10:00:00.000Z",
    recurrence_type: "once",
    dm_reminder_minutes: "0",
    dm_trigger_id: "",
    creator_locale: "en",
    ...overrides,
  };
}

interface ApiResponses {
  "users.info"?: Record<string, unknown>;
  "apps.datastore.get"?: Record<string, unknown>;
  "apps.datastore.put"?: Record<string, unknown>;
  "chat.postMessage"?: Record<string, unknown>;
  "workflows.triggers.delete"?: Record<string, unknown>;
}

interface FetchCall {
  url: string;
  body: Record<string, unknown>;
}

function stubFetch(responses: ApiResponses) {
  const calls: FetchCall[] = [];

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
      if (method === "apps.datastore.get") {
        return new Response(
          JSON.stringify(
            responses["apps.datastore.get"] ?? {
              ok: true,
              item: makeBookingItem(),
            },
          ),
          { status: 200 },
        );
      }
      if (method === "apps.datastore.put") {
        return new Response(
          JSON.stringify(responses["apps.datastore.put"] ?? { ok: true }),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("happy path -- creator cancels booking successfully", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_CREATOR },
      }),
    );

    assertEquals(result.error, undefined);

    // Should have called users.info for locale detection
    const usersInfoCall = calls.find((c) => c.url === "users.info");
    assertEquals(usersInfoCall !== undefined, true);

    // Should have deleted the trigger
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 1);

    // Should have updated status to cancelled
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    assertEquals(putCall !== undefined, true);
    const item = parsePutItem(putCall!);
    assertEquals(item.status, "cancelled");

    // Should have posted cancellation message to the channel
    const postCall = calls.find((c) => c.url === "chat.postMessage");
    assertEquals(postCall !== undefined, true);
    assertEquals(postCall!.body.channel, TEST_CHANNEL);
    const text = postCall!.body.text as string;
    assertEquals(text.includes("Huddle cancelled"), true);
    assertEquals(text.includes("Sprint-planering"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("cancel with DM trigger -- TWO workflows.triggers.delete calls", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({
        dm_trigger_id: "Ft0456DMTRIGGER",
        dm_reminder_minutes: "15",
      }),
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_CREATOR },
      }),
    );

    assertEquals(result.error, undefined);

    // Should have deleted BOTH triggers (main + DM)
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 2);

    // First delete is the main trigger
    const rawTriggerId0 = deleteCalls[0].body.trigger_id;
    assertEquals(rawTriggerId0, "Ft0123TRIGGER");

    // Second delete is the DM trigger
    const rawTriggerId1 = deleteCalls[1].body.trigger_id;
    assertEquals(rawTriggerId1, "Ft0456DMTRIGGER");

    // Should still have updated status and posted confirmation
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    assertEquals(putCall !== undefined, true);
    const item = parsePutItem(putCall!);
    assertEquals(item.status, "cancelled");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("cancel without DM trigger -- only ONE delete call", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ dm_trigger_id: "" }),
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_CREATOR },
      }),
    );

    assertEquals(result.error, undefined);

    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking not found -- posts error to user DM", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: false,
      error: "datastore_item_not_found",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: "nonexistent", user_id: TEST_CREATOR },
      }),
    );

    assertEquals(result.error, undefined);

    // Error messages go to user DM (inputs.user_id)
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    assertEquals(postCalls[0].body.channel, TEST_CREATOR);
    const text = postCalls[0].body.text as string;
    assertEquals(text.includes("not found"), true);

    // Should NOT have attempted any other operations
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 0);
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("non-creator cannot cancel -- posts error to user DM", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_OTHER_USER },
      }),
    );

    assertEquals(result.error, undefined);

    // Error goes to the requesting user's DM
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    assertEquals(postCalls[0].body.channel, TEST_OTHER_USER);
    const text = postCalls[0].body.text as string;
    assertEquals(text.includes("Only the creator"), true);

    // Should NOT have deleted trigger or updated datastore
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 0);
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("already cancelled -- posts info message", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ status: "cancelled" }),
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_CREATOR },
      }),
    );

    assertEquals(result.error, undefined);

    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    const text = postCalls[0].body.text as string;
    assertEquals(text.includes("already cancelled"), true);

    // Should NOT have deleted trigger or updated datastore
    const deleteCalls = calls.filter(
      (c) => c.url === "workflows.triggers.delete",
    );
    assertEquals(deleteCalls.length, 0);
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("trigger delete failure -- still marks booking as cancelled", async () => {
  const { fetchStub, calls } = stubFetch({
    "workflows.triggers.delete": {
      ok: false,
      error: "trigger_not_found",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_CREATOR },
      }),
    );

    assertEquals(result.error, undefined);

    // Should still have updated status to cancelled
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    assertEquals(putCall !== undefined, true);
    const item = parsePutItem(putCall!);
    assertEquals(item.status, "cancelled");

    // Should still have posted confirmation
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("datastore put failure -- returns error", async () => {
  const { fetchStub } = stubFetch({
    "apps.datastore.put": {
      ok: false,
      error: "datastore_error",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { booking_id: TEST_BOOKING_ID, user_id: TEST_CREATOR },
      }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not update booking"),
      true,
    );
  } finally {
    fetchStub.restore();
  }
});

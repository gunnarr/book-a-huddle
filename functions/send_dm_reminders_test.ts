import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import handler from "./send_dm_reminders.ts";
import { SendDmRemindersFunctionDefinition } from "./send_dm_reminders.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createContext } = SlackFunctionTester(
  SendDmRemindersFunctionDefinition,
);

const TEST_BOOKING_ID = "booking-dm-123";
const TEST_CHANNEL = "C0123TEST";
const TEST_CREATOR = "U0123CREATOR";

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
    recurrence_type: "daily",
    dm_reminder_minutes: "15",
    dm_trigger_id: "Ft0456DMTRIGGER",
    creator_locale: "en",
    ...overrides,
  };
}

interface ApiResponses {
  "apps.datastore.get"?: Record<string, unknown>;
  "chat.postMessage"?: Record<string, unknown>;
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
      if (method === "chat.postMessage") {
        return new Response(
          JSON.stringify(
            responses["chat.postMessage"] ?? { ok: true, ts: "1111.2222" },
          ),
          { status: 200 },
        );
      }

      throw new Error(`Unstubbed API method: ${method}`);
    },
  );

  return { fetchStub, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("happy path -- sends DM to each participant", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    // Should have sent a DM to each participant
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 2);

    // First DM to ALICE
    assertEquals(postCalls[0].body.channel, "U0001ALICE");
    const text0 = postCalls[0].body.text as string;
    assertEquals(text0.includes("Sprint-planering"), true);
    assertEquals(text0.includes("14:00"), true);

    // Second DM to BOB
    assertEquals(postCalls[1].body.channel, "U0002BOB");
    const text1 = postCalls[1].body.text as string;
    assertEquals(text1.includes("Sprint-planering"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("single participant -- one DM sent", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({
        participants_json: JSON.stringify(["U0001ALICE"]),
      }),
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    assertEquals(postCalls[0].body.channel, "U0001ALICE");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking not found -- silent success", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: false,
      error: "datastore_item_not_found",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: "nonexistent" } }),
    );

    assertEquals(result.error, undefined);

    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking cancelled -- silent success", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ status: "cancelled" }),
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("datastore get failure (non-404) -- returns error", async () => {
  const { fetchStub } = stubFetch({
    "apps.datastore.get": {
      ok: false,
      error: "internal_error",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not read booking"),
      true,
    );
  } finally {
    fetchStub.restore();
  }
});

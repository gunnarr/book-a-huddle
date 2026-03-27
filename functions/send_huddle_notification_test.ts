import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import handler from "./send_huddle_notification.ts";
import { SendHuddleNotificationFunctionDefinition } from "./send_huddle_notification.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createContext } = SlackFunctionTester(
  SendHuddleNotificationFunctionDefinition,
);

const TEST_BOOKING_ID = "booking-abc-123";
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
    recurrence_type: "once",
    dm_reminder_minutes: "0",
    dm_trigger_id: "",
    creator_locale: "en",
    ...overrides,
  };
}

interface ApiResponses {
  "apps.datastore.get"?: Record<string, unknown>;
  "apps.datastore.put"?: Record<string, unknown>;
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
      if (method === "apps.datastore.put") {
        return new Response(
          JSON.stringify(responses["apps.datastore.put"] ?? { ok: true }),
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

Deno.test("happy path -- posts notification and marks one-time booking as completed", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    // Should have posted notification
    const postCall = calls.find((c) => c.url === "chat.postMessage");
    assertEquals(postCall !== undefined, true);
    assertEquals(postCall!.body.channel, TEST_CHANNEL);
    const text = postCall!.body.text as string;
    assertEquals(text.includes("Sprint-planering"), true);
    assertEquals(text.includes("<@U0001ALICE>"), true);
    assertEquals(text.includes("<@U0002BOB>"), true);

    // Should have Block Kit with headphones header
    const rawBlocks = postCall!.body.blocks;
    const blocks =
      (typeof rawBlocks === "string" ? JSON.parse(rawBlocks) : rawBlocks) as {
        text: { text: string };
      }[];
    assertEquals(blocks[0].text.text, ":headphones: Time for huddle!");

    // Should have updated status to completed (one-time booking)
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    assertEquals(putCall !== undefined, true);
    const item = parsePutItem(putCall!);
    assertEquals(item.status, "completed");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("recurring booking -- does NOT mark as completed", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ recurrence_type: "daily" }),
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    // Should have posted notification
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);

    // Should NOT have called datastore.put (no status update for recurring)
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("weekly recurring booking -- does NOT mark as completed", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ recurrence_type: "weekly" }),
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    // Should have posted notification
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);

    // Should NOT have called datastore.put
    const putCalls = calls.filter((c) => c.url === "apps.datastore.put");
    assertEquals(putCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking with undefined recurrence_type -- marks as completed (backward compat)", async () => {
  const booking = makeBookingItem();
  // deno-lint-ignore no-explicit-any
  delete (booking as any).recurrence_type;

  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": { ok: true, item: booking },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(result.error, undefined);

    // Should have posted notification
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);

    // Should have updated status to completed (defaults to "once")
    const putCall = calls.find((c) => c.url === "apps.datastore.put");
    assertEquals(putCall !== undefined, true);
    const item = parsePutItem(putCall!);
    assertEquals(item.status, "completed");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking not found -- silent success, no message posted", async () => {
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

Deno.test("booking cancelled -- silent success, no message posted", async () => {
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

Deno.test("booking already completed -- silent success", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ status: "completed" }),
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

Deno.test("chat.postMessage failure -- returns error", async () => {
  const { fetchStub } = stubFetch({
    "chat.postMessage": {
      ok: false,
      error: "channel_not_found",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not send notification"),
      true,
    );
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

Deno.test("datastore put failure -- returns error after posting", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.put": {
      ok: false,
      error: "datastore_error",
    },
  });

  try {
    const result = await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not update booking"),
      true,
    );

    // Should still have posted the notification
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("participant mentions use space separator in notification", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({
        participants_json: JSON.stringify([
          "U001",
          "U002",
          "U003",
        ]),
      }),
    },
  });

  try {
    await handler(
      createContext({ inputs: { booking_id: TEST_BOOKING_ID } }),
    );

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const rawBlocks = postCall!.body.blocks;
    const blocks =
      (typeof rawBlocks === "string" ? JSON.parse(rawBlocks) : rawBlocks) as {
        text: { text: string };
      }[];
    const sectionText = blocks[1].text.text;
    assertEquals(sectionText.includes("<@U001> <@U002> <@U003>"), true);
  } finally {
    fetchStub.restore();
  }
});

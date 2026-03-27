import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import handler from "./edit_booking.ts";
import { EditBookingFunctionDefinition } from "./edit_booking.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createContext } = SlackFunctionTester(EditBookingFunctionDefinition);
const TEST_BOOKING_ID = "booking-edit-123";
const TEST_CHANNEL = "C0123TEST";
const TEST_CREATOR = "U0123CREATOR";
const TEST_OTHER_USER = "U9999OTHER";
const TEST_INTERACTIVITY_POINTER = "interactivity-ptr-abc";

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

function makeInteractivity(userId: string) {
  return {
    interactor: { id: userId, secret: "" },
    interactivity_pointer: TEST_INTERACTIVITY_POINTER,
  };
}

interface ApiResponses {
  "users.info"?: Record<string, unknown>;
  "apps.datastore.get"?: Record<string, unknown>;
  "chat.postMessage"?: Record<string, unknown>;
  "views.open"?: Record<string, unknown>;
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
      if (method === "chat.postMessage") {
        return new Response(
          JSON.stringify(
            responses["chat.postMessage"] ?? { ok: true, ts: "1111.2222" },
          ),
          { status: 200 },
        );
      }
      if (method === "views.open") {
        return new Response(
          JSON.stringify(
            responses["views.open"] ?? { ok: true, view: { id: "V0123" } },
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

Deno.test("happy path -- opens modal with correct initial values, returns completed: false", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: {
          booking_id: TEST_BOOKING_ID,
          interactivity: makeInteractivity(TEST_CREATOR),
        },
      }),
    );

    // Should return completed: false (waiting for modal submission)
    assertEquals(result.error, undefined);
    assertEquals(
      (result as Record<string, unknown>).completed,
      false,
    );

    // Should have called users.info for locale detection
    const usersInfoCall = calls.find((c) => c.url === "users.info");
    assertEquals(usersInfoCall !== undefined, true);

    // Should have called views.open
    const viewCall = calls.find((c) => c.url === "views.open");
    assertEquals(viewCall !== undefined, true);

    // Verify interactivity_pointer is passed
    assertEquals(
      viewCall!.body.interactivity_pointer,
      TEST_INTERACTIVITY_POINTER,
    );

    // Verify modal view structure
    const rawView = viewCall!.body.view;
    const view = typeof rawView === "string"
      ? JSON.parse(rawView)
      : rawView as Record<string, unknown>;
    assertEquals(view.type, "modal");
    assertEquals(view.callback_id, "edit_booking_modal");

    // Verify private_metadata contains booking details
    const meta = JSON.parse(view.private_metadata as string);
    assertEquals(meta.booking_id, TEST_BOOKING_ID);
    assertEquals(meta.channel_id, TEST_CHANNEL);
    assertEquals(meta.old_trigger_id, "Ft0123TRIGGER");

    // Verify blocks contain initial values
    const blocks = view.blocks as Record<string, unknown>[];
    // First block is the title input
    const titleBlock = blocks.find(
      (b) => (b as Record<string, string>).block_id === "title_block",
    ) as Record<string, unknown>;
    assertEquals(titleBlock !== undefined, true);
    const titleElement = titleBlock.element as Record<string, unknown>;
    assertEquals(titleElement.initial_value, "Sprint-planering");

    // Should NOT have posted any chat message
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking not found -- posts error, returns completed: true", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: false,
      error: "datastore_item_not_found",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: {
          booking_id: "nonexistent",
          interactivity: makeInteractivity(TEST_CREATOR),
        },
      }),
    );

    // Should return completed: true (no modal to wait for)
    assertEquals(result.error, undefined);
    assertEquals(
      (result as Record<string, unknown>).completed,
      true,
    );

    // Should have posted an error message to the user
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    assertEquals(postCalls[0].body.channel, TEST_CREATOR);
    const text = postCalls[0].body.text as string;
    assertEquals(text.includes("not found"), true);

    // Should NOT have opened a modal
    const viewCalls = calls.filter((c) => c.url === "views.open");
    assertEquals(viewCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("non-creator -- posts error, returns completed: true", async () => {
  const { fetchStub, calls } = stubFetch({});

  try {
    const result = await handler(
      createContext({
        inputs: {
          booking_id: TEST_BOOKING_ID,
          interactivity: makeInteractivity(TEST_OTHER_USER),
        },
      }),
    );

    // Should return completed: true (no modal to wait for)
    assertEquals(result.error, undefined);
    assertEquals(
      (result as Record<string, unknown>).completed,
      true,
    );

    // Should have posted an error message to the non-creator user
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    assertEquals(postCalls[0].body.channel, TEST_OTHER_USER);
    const text = postCalls[0].body.text as string;
    assertEquals(text.includes("Only the creator"), true);

    // Should NOT have opened a modal
    const viewCalls = calls.filter((c) => c.url === "views.open");
    assertEquals(viewCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking already cancelled -- posts error, returns completed: true", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.get": {
      ok: true,
      item: makeBookingItem({ status: "cancelled" }),
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: {
          booking_id: TEST_BOOKING_ID,
          interactivity: makeInteractivity(TEST_CREATOR),
        },
      }),
    );

    // Should return completed: true (no modal to wait for)
    assertEquals(result.error, undefined);
    assertEquals(
      (result as Record<string, unknown>).completed,
      true,
    );

    // Should have posted an error message
    const postCalls = calls.filter((c) => c.url === "chat.postMessage");
    assertEquals(postCalls.length, 1);
    assertEquals(postCalls[0].body.channel, TEST_CREATOR);
    const text = postCalls[0].body.text as string;
    assertEquals(text.includes("not found"), true);

    // Should NOT have opened a modal
    const viewCalls = calls.filter((c) => c.url === "views.open");
    assertEquals(viewCalls.length, 0);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("views.open failure -- returns error", async () => {
  const { fetchStub } = stubFetch({
    "views.open": {
      ok: false,
      error: "expired_trigger_id",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: {
          booking_id: TEST_BOOKING_ID,
          interactivity: makeInteractivity(TEST_CREATOR),
        },
      }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not open modal"),
      true,
    );
  } finally {
    fetchStub.restore();
  }
});

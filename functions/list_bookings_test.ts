import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import handler from "./list_bookings.ts";
import { ListBookingsFunctionDefinition } from "./list_bookings.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const { createContext } = SlackFunctionTester(ListBookingsFunctionDefinition);
const TEST_CHANNEL = "C0123TEST";
const TEST_USER = "U0123USER";

function makeBooking(overrides: Record<string, string> = {}) {
  return {
    id: crypto.randomUUID(),
    title: "Standup",
    channel_id: TEST_CHANNEL,
    creator_id: "U0123CREATOR",
    participants_json: JSON.stringify(["U0001ALICE"]),
    scheduled_date: "2099-12-31",
    scheduled_time: "14:00",
    trigger_id: "Ft0123",
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
  "apps.datastore.query"?: Record<string, unknown>;
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
      if (method === "apps.datastore.query") {
        return new Response(
          JSON.stringify(
            responses["apps.datastore.query"] ?? { ok: true, items: [] },
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

type Block = { type: string; text?: { text: string } };

function parseBlocks(postCall: FetchCall): Block[] {
  const raw = postCall.body.blocks;
  if (typeof raw === "string") return JSON.parse(raw);
  return raw as Block[];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("no bookings -- posts empty message", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": { ok: true, items: [] },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(result.error, undefined);

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    assertEquals(postCall !== undefined, true);
    const text = postCall!.body.text as string;
    assertEquals(text.includes("No upcoming huddles"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("multiple bookings -- lists all sorted by time", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": {
      ok: true,
      items: [
        makeBooking({
          id: "late",
          title: "Retrospektiv",
          scheduled_date: "2099-12-31",
          scheduled_time: "16:00",
        }),
        makeBooking({
          id: "early",
          title: "Standup",
          scheduled_date: "2099-12-31",
          scheduled_time: "09:00",
        }),
      ],
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(result.error, undefined);

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const blocks = parseBlocks(postCall!);

    // Find section blocks (skip header, dividers, context)
    const sections = blocks.filter((b) => b.type === "section");
    assertEquals(sections.length, 2);

    // First should be the earlier booking
    assertEquals(sections[0].text!.text.includes("Standup"), true);
    assertEquals(sections[1].text!.text.includes("Retrospektiv"), true);

    // Fallback text
    const text = postCall!.body.text as string;
    assertEquals(text.includes("2"), true);
    assertEquals(text.includes("upcoming huddles"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("filters out other channels", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": {
      ok: true,
      items: [
        makeBooking({ channel_id: "C_OTHER_CHANNEL", title: "Annan kanal" }),
        makeBooking({ title: "Rätt kanal" }),
      ],
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(result.error, undefined);

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const blocks = parseBlocks(postCall!);
    const sections = blocks.filter((b) => b.type === "section");
    assertEquals(sections.length, 1);
    assertEquals(sections[0].text!.text.includes("Rätt kanal"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("filters out past one-time bookings", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": {
      ok: true,
      items: [
        makeBooking({
          title: "Gammal",
          scheduled_date: "2020-01-01",
          scheduled_time: "09:00",
          recurrence_type: "once",
        }),
        makeBooking({ title: "Framtida" }),
      ],
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(result.error, undefined);

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const blocks = parseBlocks(postCall!);
    const sections = blocks.filter((b) => b.type === "section");
    assertEquals(sections.length, 1);
    assertEquals(sections[0].text!.text.includes("Framtida"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("recurring booking with past start date -- still shows", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": {
      ok: true,
      items: [
        makeBooking({
          title: "Daglig standup",
          scheduled_date: "2026-01-01",
          scheduled_time: "09:00",
          recurrence_type: "daily",
        }),
      ],
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(result.error, undefined);

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const blocks = parseBlocks(postCall!);
    const sections = blocks.filter((b) => b.type === "section");
    assertEquals(sections.length, 1);
    assertEquals(sections[0].text!.text.includes("Daglig standup"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("booking with recurrence shows recurrence suffix in text", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": {
      ok: true,
      items: [
        makeBooking({
          title: "Veckomöte",
          recurrence_type: "weekly",
        }),
      ],
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(result.error, undefined);

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const blocks = parseBlocks(postCall!);
    const sections = blocks.filter((b) => b.type === "section");
    assertEquals(sections.length, 1);
    // Should include recurrence label as suffix
    assertEquals(sections[0].text!.text.includes("Weekly"), true);
  } finally {
    fetchStub.restore();
  }
});

Deno.test("singular grammar for one booking", async () => {
  const { fetchStub, calls } = stubFetch({
    "apps.datastore.query": {
      ok: true,
      items: [makeBooking()],
    },
  });

  try {
    await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    const postCall = calls.find((c) => c.url === "chat.postMessage");
    const text = postCall!.body.text as string;
    assertEquals(text, "1 upcoming huddle in this channel");
  } finally {
    fetchStub.restore();
  }
});

Deno.test("datastore query failure -- returns error", async () => {
  const { fetchStub } = stubFetch({
    "apps.datastore.query": {
      ok: false,
      error: "internal_error",
    },
  });

  try {
    const result = await handler(
      createContext({
        inputs: { channel_id: TEST_CHANNEL, user_id: TEST_USER },
      }),
    );

    assertEquals(typeof result.error, "string");
    assertEquals(
      (result.error as string).includes("Could not fetch bookings"),
      true,
    );
  } finally {
    fetchStub.restore();
  }
});

// Fixture emails for eval/run.ts, chosen to exercise each rule in
// src/prompts/extractActionItems.system.md's Phase 1/Phase 2 framework rather than to
// be a representative sample of a real inbox: one fixture per rule, plus a couple that
// combine rules the way real mail does. Add a fixture here whenever the prompt gains a
// new rule, or whenever a real email tricks it into misclassifying something.
import type { EmailContent } from "../src/gmail.js";

export interface ItemExpectation {
  // Substring/regex the item's title/description must contain. Deliberately loose —
  // this is an LLM's wording, not a template — so assertions survive rephrasing and
  // only fail when the *substance* of the extraction is wrong.
  titleContains?: string | RegExp;
  descriptionContains?: string | RegExp;
  // 'present'/'absent' check whether a due date was extracted at all; a string checks
  // the exact value. Omit to not assert on dueDate for this item.
  dueDate?: "present" | "absent" | string;
}

export interface EvalFixture {
  name: string;
  // Which prompt rule(s) this fixture targets — shown in output so a failure points
  // straight at the relevant section of extractActionItems.system.md.
  rule: string;
  email: EmailContent;
  expect: {
    // Exact count, or a {min, max} range when the model has legitimate latitude
    // (e.g. "merge into one, or list up to two ranked items" cases).
    count: number | { min?: number; max?: number };
    // expect.items[i] is checked against the i'th returned action item. The prompt
    // requires sorting by importance, so index 0 should always be the top item.
    items?: ItemExpectation[];
  };
}

export const fixtures: EvalFixture[] = [
  {
    name: "hand-written-request-with-due-date",
    rule: "Phase 2.1 (hand-written → always generate) + 2.3 (explicit due date → always generate)",
    email: {
      id: "fixture-1",
      subject: "Q3 report",
      from: "boss@example.com",
      body: "Hey, could you send over the September 3 report by this Friday? Thanks!",
    },
    expect: {
      count: 1,
      items: [{ titleContains: /report/i, dueDate: "present" }],
    },
  },
  {
    name: "newsletter-no-action",
    rule: "Phase 2.4 (purely informational → no action) example: newsletters",
    email: {
      id: "fixture-2",
      subject: "This week in Frontend Weekly",
      from: "newsletter@frontendweekly.example.com",
      body: [
        "This week: 10 new CSS features, a deep dive on React Server Components,",
        "and our usual roundup of conference talks. Read on for the full issue.",
        "",
        "You're receiving this because you subscribed at frontendweekly.example.com.",
        "Unsubscribe at any time.",
      ].join("\n"),
    },
    expect: { count: 0 },
  },
  {
    name: "automated-payment-notification-no-action",
    rule: "Phase 2.4 (purely informational → no action) example: automatic payment notifications",
    email: {
      id: "fixture-3",
      subject: "Payment confirmation",
      from: "no-reply@billing.example.com",
      body: "Your payment of $42.00 to Acme Hosting was successful. No further action is needed.",
    },
    expect: { count: 0 },
  },
  {
    name: "mutually-exclusive-options-merged",
    rule: "Phase 2.2 (mutually exclusive actions → merge into one)",
    email: {
      id: "fixture-4",
      subject: "Quick call?",
      from: "colleague@example.com",
      body: "Could we grab 15 minutes either Tuesday at 3pm or Wednesday at 10am? Let me know which works for you.",
    },
    expect: {
      count: 1,
      items: [{ titleContains: /call|meet|schedul/i }],
    },
  },
  {
    name: "automated-reminder-with-due-date",
    rule: "Phase 2.3 (explicit due date → always generate, even if automated)",
    email: {
      id: "fixture-5",
      subject: "Appointment reminder",
      from: "reminders@dentist-example.com",
      body: "This is a reminder that your dental appointment is on August 15th at 10:00 AM. Please call us if you need to reschedule.",
    },
    expect: {
      count: 1,
      items: [{ titleContains: /appointment|dentist/i, dueDate: "present" }],
    },
  },
  {
    name: "multiple-real-asks-ranked",
    rule: "Phase 2 ordering (sort by importance) + multiple genuine action items",
    email: {
      id: "fixture-6",
      subject: "Two things before the trip",
      from: "manager@example.com",
      body: [
        "Hi, two things before you head out:",
        "",
        "1. Please send back the signed contract by Monday, it's blocking the client kickoff.",
        "2. Whenever you get a chance, let me know your availability for next month's offsite.",
        "",
        "Thanks!",
      ].join("\n"),
    },
    expect: {
      count: { min: 1, max: 2 },
      items: [{ titleContains: /contract/i, dueDate: "present" }],
    },
  },
  {
    name: "automated-shipping-notification-no-action",
    rule: "Phase 1.4 (assess impact of missing it) — purely informational, no due date attached to the receiver",
    email: {
      id: "fixture-7",
      subject: "Your order has shipped",
      from: "orders@shop.example.com",
      body: "zarejestrowaliśmy zlecenie płatności dla GRUPA OLX SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ (http://olx.pl/). Możesz w dowolnym momencie sprawdzić, czy transakcja została już opłacona",
    },
    expect: { count: 0 },
  },
  {
    name: "linkedin-notification-digest-no-action",
    rule: "Phase 2.4 (purely informational → no action) — automated social-network digest, no genuine ask",
    email: {
      id: "fixture-9",
      subject: "You have 5 new notifications on LinkedIn",
      from: "notifications-noreply@linkedin.com",
      body: [
        "Here's what you missed on LinkedIn:",
        "",
        "- Jordan Lee viewed your profile",
        "- Sam Patel and 3 others reacted to your post",
        "- Acme Corp is hiring: 12 new jobs match your profile",
        "- Taylor Kim endorsed you for 'Project Management'",
        "",
        "See all notifications on LinkedIn.",
      ].join("\n"),
    },
    expect: { count: 0 },
  },
  {
    name: "hand-written-request-no-due-date",
    rule: "Phase 2.1 (hand-written → always generate, even without a due date)",
    email: {
      id: "fixture-8",
      subject: "PR review",
      from: "teammate@example.com",
      body: "Could you review my PR when you have a moment? No rush, just don't want it to go stale.",
    },
    expect: {
      coun
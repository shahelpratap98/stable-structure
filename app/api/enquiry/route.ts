import { NextResponse, type NextRequest } from "next/server";
import { sendEmail } from "@/lib/email";
import { hitMemory, ipFrom } from "@/lib/rate-limit-memory";

// The website's "Make an enquiry" form (contact page) posts here. The enquiry
// is emailed to the office through Resend, with Reply-To set to the visitor so
// a reply in Outlook goes straight back to them.
//
// main.js submits with fetch and gets JSON back. Without JavaScript the form
// still posts here as a normal form and is redirected back to the contact page.

const TO = process.env.ENQUIRY_TO || "gajan@stablestructure.co.nz";
const LIMITS = { name: 120, phone: 40, email: 200, service: 120, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Fields = Record<keyof typeof LIMITS | "website", string>;

async function readFields(request: NextRequest): Promise<{ fields: Fields; json: boolean }> {
  const json = (request.headers.get("content-type") ?? "").includes("application/json");
  let raw: Record<string, unknown> = {};
  try {
    raw = json ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    // empty or malformed body: validation below rejects it
  }
  const get = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  return {
    json,
    fields: {
      name: get("name"),
      phone: get("phone"),
      email: get("email"),
      service: get("service"),
      message: get("message"),
      website: get("website"), // honeypot: hidden from people, filled in by bots
    },
  };
}

function reply(json: boolean, request: NextRequest, status: number, error?: string) {
  if (json) return NextResponse.json(error ? { ok: false, error } : { ok: true }, { status, headers: { "Cache-Control": "no-store" } });
  const back = new URL("/contact", request.url);
  back.searchParams.set("enquiry", error ? "error" : "sent");
  back.hash = "enquiryForm";
  return NextResponse.redirect(back, 303);
}

export async function POST(request: NextRequest) {
  const { fields: f, json } = await readFields(request);

  // A few genuine enquiries an hour per address is plenty; this only stops floods.
  if (!hitMemory(`enquiry:${ipFrom(request.headers)}`, 5, 600).ok) {
    return reply(json, request, 429, "Too many enquiries from this connection.");
  }

  // Bots fill the hidden field. Pretend it worked so they don't adapt.
  if (f.website) return reply(json, request, 200);

  if (!f.name || !f.phone || !f.email) return reply(json, request, 400, "Please fill in your name, phone and email.");
  if (!EMAIL_RE.test(f.email)) return reply(json, request, 400, "Please check your email address.");
  for (const [k, max] of Object.entries(LIMITS)) {
    if (f[k as keyof typeof LIMITS].length > max) return reply(json, request, 400, "That enquiry is too long. Please shorten it.");
  }

  const sent = await sendEmail({
    to: TO,
    replyTo: f.email,
    subject: `Website enquiry: ${f.service || "General"} - ${f.name}`.replace(/[\r\n]+/g, " "),
    paragraphs: [
      `New enquiry from the website contact form.`,
      `Name: ${f.name}`,
      `Phone: ${f.phone}`,
      `Email: ${f.email}`,
      `Service: ${f.service || "Not specified"}`,
      `Project details: ${f.message || "(none given)"}`,
      `Reply to this email to answer ${f.name} directly.`,
    ],
    footer: "Sent from the enquiry form on stablestructure.co.nz",
  });

  if (!sent.ok) {
    console.error("[enquiry] not sent:", sent.error);
    return reply(json, request, 502, "Sorry, your enquiry couldn't be sent just now.");
  }
  return reply(json, request, 200);
}

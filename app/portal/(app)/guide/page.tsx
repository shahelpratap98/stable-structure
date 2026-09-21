import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin, isApprover, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Guide" };

// The guide is assembled on the server from the reader's role, so a staff
// member's page never contains the approver or admin instructions at all.
type Audience = "everyone" | "approver" | "admin";
type Section = { id: string; title: string; audience: Audience; body: ReactNode };

const AUDIENCE_LABEL: Record<Audience, string> = { everyone: "Everyone", approver: "Approvers", admin: "Admins" };
const AUDIENCE_CHIP: Record<Audience, string> = {
  everyone: "bg-steel-100 text-steel",
  approver: "bg-accent-100 text-accent-600",
  admin: "bg-ink text-white",
};

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 marker:font-semibold marker:text-ink">{children}</ol>;
}
function Points({ children }: { children: ReactNode }) {
  return <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 marker:text-muted">{children}</ul>;
}
function Term({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink">{children}</span>;
}
function Tip({ children }: { children: ReactNode }) {
  return <p className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[15px]"><Term>Good to know: </Term>{children}</p>;
}
function Go({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-semibold text-accent-600 underline-offset-4 hover:underline">{children}</Link>;
}

export default async function GuidePage() {
  const profile = await requireProfile();
  const approver = isApprover(profile.role);
  const admin = isAdmin(profile.role);

  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("standard_day_hours").maybeSingle();
  const standard = Number(profile.standard_day_hours ?? settings?.standard_day_hours ?? 8);

  const sections: Section[] = [
    {
      id: "signing-in",
      title: "Signing in and your password",
      audience: "everyone",
      body: (
        <>
          <p>
            The portal lives at <Term>stablestructure.co.nz/portal</Term>. There is a <Term>Staff login</Term> link at the top and bottom of the
            website, and <Term>stablestructure.co.nz/login</Term> takes you straight there. It works on a phone, tablet or computer, with nothing to install.
          </p>
          <Points>
            <li><Term>First time:</Term> you&apos;ll be sent a one-time link. Open it, choose a password of at least 12 characters, and you&apos;re in. The link works once and expires after 24 hours; if it has expired, ask an admin for a new one.</li>
            <li><Term>Forgot your password:</Term> choose &quot;Forgot your password?&quot; on the sign-in page and follow the email link.</li>
            <li><Term>Change your password:</Term> click your name in the top bar to open <Go href="/portal/account">My account</Go>.</li>
            <li><Term>Shared computer:</Term> use <Term>Sign out</Term> in the top bar when you finish.</li>
          </Points>
          <Tip>After 5 wrong passwords the portal pauses sign-in for that account for about 15 minutes. That is there to stop password guessing; just wait, or reset your password.</Tip>
        </>
      ),
    },
    {
      id: "entering-time",
      title: "Entering your time",
      audience: "everyone",
      body: (
        <>
          <p><Go href="/portal/my/day">My day</Go> is where you record what you worked on. It opens on today.</p>
          <Steps>
            <li>Pick the day. Use the week strip, the <Term>Previous / Next week</Term> links, or <Term>Go to date</Term> for anything further back.</li>
            <li>Choose the <Term>Project</Term>. They are listed by project number, then name.</li>
            <li>Choose the <Term>Work type</Term> (Site Visit, Original Scope, a Variation, Council RFI and so on).</li>
            <li><Term>Chargeable</Term> fills itself in from the project: client jobs default to Yes, internal ones (admin, internal meetings) default to No. Change it only if this piece of work is different.</li>
            <li>Enter <Term>Hours</Term> as a decimal: 1.5 means one and a half hours, 0.25 is fifteen minutes.</li>
            <li>Write a short <Term>Task description</Term>, e.g. &quot;Foundation redesign to TC3, ground beams added&quot;. This text can appear on the client&apos;s invoice, so make it meaningful.</li>
            <li>Worked on more than one thing? Choose <Term>+ Add another entry</Term> and repeat.</li>
          </Steps>
          <p className="mt-4">The running total at the top right shows your hours against your standard day of <Term>{standard} hours</Term>, and how much is still to go.</p>
        </>
      ),
    },
    {
      id: "draft-and-submit",
      title: "Save draft or submit the day",
      audience: "everyone",
      body: (
        <>
          <Points>
            <li><Term>Save draft</Term> keeps what you&apos;ve typed so you can come back to it. Drafts can be half-finished. They don&apos;t count towards your hours yet and nobody is asked to approve them.</li>
            <li><Term>Submit day for approval</Term> sends the day to be signed off. Every entry has to be complete first: project, work type, hours and a description. If something is missing, the portal highlights that entry, tells you what it needs, and submits nothing until it&apos;s fixed.</li>
          </Points>
          <p className="mt-4">
            Once submitted, entries move to <Term>Already submitted for this day</Term> underneath and can no longer be edited by you. Forgot something?
            Just add another entry on the same day and submit again. Need a submitted entry changed? Ask an approver to return it to you.
          </p>
          <Tip>A day can hold up to 24 hours and 50 entries.</Tip>
        </>
      ),
    },
    {
      id: "week-strip",
      title: "Reading the week strip",
      audience: "everyone",
      body: (
        <>
          <p>The seven boxes at the top of My day show your submitted hours for each day of the week.</p>
          <Points>
            <li><span className="chip bg-warn-bg text-warn">Short 2.5</span> a past weekday with fewer than {standard} hours submitted, and how many are missing.</li>
            <li><span className="chip bg-ok-bg text-ok">Full day</span> or <span className="chip bg-ok-bg text-ok">+1</span> you&apos;ve reached your standard day, or gone over it by that much.</li>
            <li><span className="chip bg-bad-bg text-bad">Returned</span> an approver has sent something back for you to fix (see below).</li>
            <li><Term>Draft</Term> there is unsent work saved on that day.</li>
            <li><Term>Holiday</Term> and weekends are never marked short. If you do work on one, enter it as normal and it counts as extra hours.</li>
          </Points>
        </>
      ),
    },
    {
      id: "returned",
      title: "When an entry is returned to you",
      audience: "everyone",
      body: (
        <>
          <p>If an approver spots a problem, such as the wrong project, they return the entry with a note instead of approving it.</p>
          <Steps>
            <li>The day turns red in your week strip. Open it.</li>
            <li>The returned entry is editable again, with the approver&apos;s note shown in red at the top of it.</li>
            <li>Fix it, then choose <Term>Submit day for approval</Term> again.</li>
          </Steps>
        </>
      ),
    },
    {
      id: "my-hours",
      title: approver ? "Checking your own hours" : "My hours",
      audience: "everyone",
      body: (
        <>
          <p>
            {approver ? <>Under <Go href="/portal/reports">Reports</Go>, two reports cover your own time:</> : <><Go href="/portal/reports">My hours</Go> in the top bar has two reports about your own time:</>}
          </p>
          <Points>
            <li><Term>Hours check</Term> lists every day in a date range with its status: <span className="chip bg-bad-bg text-bad">SHORT by 2 hrs</span>, <span className="chip bg-warn-bg text-warn">Over by 1 hrs</span>, <span className="chip bg-ok-bg text-ok">OK - full day</span> or <span className="chip bg-steel-100 text-steel">Public holiday</span>, plus totals. Use it on a Friday to find any day you forgot.</li>
            <li><Term>{approver ? "Employee detail" : "My time"}</Term> lists every entry you&apos;ve submitted in the range, with its status.</li>
          </Points>
          <p className="mt-4">Set the dates and choose <Term>Update</Term>. <Term>Export to Excel</Term> downloads exactly what is on screen, and <Term>Print / save as PDF</Term> gives a clean copy without the menus.</p>
          {!approver ? <Tip>You only ever see your own time. Charge-out rates and dollar values are not shown to staff.</Tip> : null}
        </>
      ),
    },
    {
      id: "statuses",
      title: "What each status means",
      audience: "everyone",
      body: (
        <dl className="mt-1 grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr]">
          <dt><span className="chip bg-surface-2 text-muted">Draft</span></dt><dd>Saved but not sent. Only counts once you submit it.</dd>
          <dt><span className="chip bg-accent-100 text-accent-600">Submitted</span></dt><dd>Waiting for an approver to sign it off.</dd>
          <dt><span className="chip bg-bad-bg text-bad">Returned</span></dt><dd>Sent back to you with a note. Fix it and submit again.</dd>
          <dt><span className="chip bg-ok-bg text-ok">Approved</span></dt><dd>Signed off. Chargeable time is now ready to be invoiced.</dd>
          <dt><span className="chip bg-steel-100 text-steel">Invoiced</span></dt><dd>Billed to the client and locked.</dd>
        </dl>
      ),
    },

    // ------------------------------------------------------------ approvers
    {
      id: "approvals",
      title: "Approving time",
      audience: "approver",
      body: (
        <>
          <p><Go href="/portal/approvals">Approvals</Go> lists everything staff have submitted, grouped by person. The number beside it in the top bar is how many entries are waiting.</p>
          <Steps>
            <li>Everything starts ticked. Read down each person&apos;s entries: date, project, work type, task, hours and value.</li>
            <li>Untick anything you don&apos;t want to act on yet. The tick beside a person&apos;s name selects or clears all of theirs.</li>
            <li>Choose <Term>Approve selected</Term>.</li>
          </Steps>
          <p className="mt-4">
            To send something back instead, tick only those entries, type a <Term>note</Term> explaining what to fix (it&apos;s required), and choose <Term>Return selected</Term>.
            The person sees the note on their My day screen.
          </p>
          <Tip>
            Approving <Term>freezes the charge-out rate</Term> on each entry, so changing a project&apos;s rate later never alters time that was already approved.
            A <span className="chip bg-warn-bg text-warn">No rate set</span> chip means the project has no rate yet: the time can still be approved, but it can&apos;t be invoiced until {admin ? "you set one" : "an admin sets one"}.
          </Tip>
        </>
      ),
    },
    {
      id: "all-entries",
      title: "Finding and correcting entries",
      audience: "approver",
      body: (
        <>
          <p><Go href="/portal/entries">All entries</Go> is the full timesheet: every line from everyone, including drafts. Filter by date range, employee, project, status or chargeable; the totals above the table follow the filter. <Term>Export to Excel</Term> downloads the filtered list in the old workbook&apos;s Timesheet layout.</p>
          <Points>
            <li><Term>Edit</Term> opens an entry so you can correct the date, project, work type, chargeable flag, hours or description.</li>
            <li><Term>Rate override</Term> charges that one entry at a different hourly rate from the project&apos;s. Leave it blank to use the project rate. Overridden rates show a <Term>*</Term> in the table.</li>
            <li><Term>+ Add an entry for someone</Term> is for when a person can&apos;t enter their own time. It goes into the Approvals queue like any other.</li>
            <li><Term>Delete</Term> removes an entry for good, after you tick the confirmation box.</li>
            <li>Entries that are <span className="chip bg-steel-100 text-steel">Invoiced</span> are locked. The invoice has to be voided before they can change.</li>
          </Points>
          <Tip>Every edit, override and deletion is recorded with your name and the before and after values{admin ? <> in the <Go href="/portal/admin/audit">audit log</Go></> : " in the audit log"}.</Tip>
        </>
      ),
    },
    {
      id: "reports",
      title: "Reports",
      audience: "approver",
      body: (
        <>
          <p><Go href="/portal/reports">Reports</Go> has the same six views the workbook had. Each takes a date range. <Term>Export to Excel</Term> downloads what&apos;s on screen and <Term>Print / save as PDF</Term> prints it without the menus (the Client statement makes a tidy PDF to send with an invoice). Drafts are never included.</p>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-[11rem_1fr]">
            <dt><Term>Hours check</Term></dt><dd>Short, over and full days for everyone or one person, with overtime and totals. For everyone at once, keep the range to two months or less.</dd>
            <dt><Term>Employee detail</Term></dt><dd>One person&apos;s entries line by line, with total hours and value.</dd>
            <dt><Term>Project detail</Term></dt><dd>One project or all of them, optionally only chargeable or non-chargeable time, with a summary by employee.</dd>
            <dt><Term>Period summary</Term></dt><dd>One row per project: hours, amount, hours split by work type, non-chargeable hours, work performed, and what is still uninvoiced.</dd>
            <dt><Term>Client statement</Term></dt><dd>One project broken down by person: hours, rate, amount, days worked and the work done. Handy to send alongside an invoice.</dd>
            <dt><Term>Project × employee</Term></dt><dd>A grid of who spent how long on which project.</dd>
          </dl>
        </>
      ),
    },
    ...(!admin
      ? [{
          id: "invoices-view",
          title: "Invoices",
          audience: "approver" as Audience,
          body: (
            <p>
              <Go href="/portal/invoices">Invoices</Go> shows approved chargeable time that hasn&apos;t been billed yet, and every invoice raised with its status
              (Draft, Sent, <span className="chip bg-warn-bg text-warn">Overdue</span>, Paid or Void). You can open an invoice and download its PDF. Creating, sending and voiding invoices is done by an admin.
            </p>
          ),
        }]
      : []),

    // ------------------------------------------------------------ admins
    {
      id: "staff",
      title: "Adding and managing staff",
      audience: "admin",
      body: (
        <>
          <p>People can&apos;t sign themselves up. You add them under <Go href="/portal/admin/staff">Setup → Staff</Go>.</p>
          <Steps>
            <li>Enter their name as it should appear on timesheets, their email, and a role.</li>
            <li>Choose <Term>Create account and get link</Term>.</li>
            <li>Copy the one-time link and send it to them however suits (text, WhatsApp, email). They open it and choose their own password. It works once and expires after 24 hours.</li>
          </Steps>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[7rem_1fr]">
            <dt><Term>Staff</Term></dt><dd>Enters their own time and sees their own hours. Never sees rates, values, other people&apos;s time or invoices.</dd>
            <dt><Term>Approver</Term></dt><dd>Everything staff can do, plus sees all time, rates and reports, and approves or returns entries.</dd>
            <dt><Term>Admin</Term></dt><dd>Everything an approver can do, plus Setup and creating invoices.</dd>
          </dl>
          <Points>
            <li>Open a person in the list to change their name, role or their own <Term>standard day</Term> (for part-timers; blank uses the company default).</li>
            <li><Term>Someone has left:</Term> untick <Term>Active</Term>. They can no longer sign in, and all their past time stays intact. Accounts are never deleted.</li>
            <li><Term>Lost invite or locked out:</Term> <Term>Get a new sign-in link</Term> creates a fresh one-time link for them.</li>
            <li><span className="chip bg-warn-bg text-warn">Hasn&apos;t signed in yet</span> marks people who haven&apos;t used their invite.</li>
          </Points>
          <Tip>You can&apos;t remove your own admin access or deactivate yourself, so the portal can never be left without an admin.</Tip>
        </>
      ),
    },
    {
      id: "projects",
      title: "Projects, rates, clients and work types",
      audience: "admin",
      body: (
        <>
          <Points>
            <li>
              <Go href="/portal/admin/projects">Projects &amp; rates</Go>: add a project with its number, name, client and <Term>charge-out rate ($/hr)</Term>. A banner counts active projects with no rate; their time shows as $0 and can&apos;t be invoiced until you set one.
              Tick <Term>Internal</Term> for admin and meeting codes so they default to non-chargeable and never ask for a rate. Set finished jobs to <Term>Closed</Term> and they drop out of the staff dropdown while keeping their history.
            </li>
            <li><Go href="/portal/admin/clients">Clients</Go>: the name printed as &quot;Bill to&quot; on invoices, plus billing email and postal address.</li>
            <li><Go href="/portal/admin/work-types">Work types</Go>: add, rename and reorder them (lower numbers show first). Untick <Term>Active</Term> to retire one without touching old entries.</li>
            <li><Go href="/portal/admin/holidays">Public holidays</Go>: NZ and Auckland holidays are loaded through 2028. Add an office shutdown day here too, so nobody is marked short for it.</li>
            <li><Go href="/portal/admin/settings">Company &amp; GST</Go>: your invoice letterhead (GST number, address, contact line, bank details), the GST rate, the standard day, the invoice prefix and next number, and payment terms.</li>
          </Points>
          <Tip>Changing a project&apos;s rate only affects time that hasn&apos;t been approved yet. Approved and invoiced time keeps the rate it was approved at.</Tip>
        </>
      ),
    },
    {
      id: "invoicing",
      title: "Creating and managing invoices",
      audience: "admin",
      body: (
        <>
          <p><Go href="/portal/invoices">Invoices</Go> opens with what is <Term>ready to invoice</Term>: approved, chargeable time that hasn&apos;t been billed, per project.</p>
          <Steps>
            <li>Choose <Term>Invoice this</Term> beside a project (or <Term>+ New invoice</Term> and pick the project and period yourself).</li>
            <li>Check the preview. Time is grouped by work type, with the task descriptions underneath, then subtotal, GST and total. Only approved, chargeable, not-yet-invoiced time in the period is included.</li>
            <li>Set the invoice date and choose <Term>Create invoice</Term>. The number is assigned automatically and the entries are locked to it.</li>
            <li><Term>Download PDF</Term> and send it to the client, then choose <Term>Mark as sent</Term>. When the money arrives, <Term>Mark as paid</Term>.</li>
          </Steps>
          <Points>
            <li>If the preview says some time has <Term>no charge-out rate</Term>, set the rate on the project (or a rate override on those entries) and preview again.</li>
            <li>A sent invoice past its due date shows as <span className="chip bg-warn-bg text-warn">Overdue</span>.</li>
            <li><Term>Invoiced it from Xero or another system instead?</Term> Preview the project and period as usual, then open <Term>Already invoiced this somewhere else?</Term>, enter that invoice&apos;s number and choose <Term>Mark this time as invoiced</Term>. The time drops off &quot;ready to invoice&quot; and shows as <span className="chip bg-steel-100 text-steel">Billed elsewhere</span> in the list. It doesn&apos;t use up a portal invoice number.</li>
            <li><Term>Made a mistake?</Term> <Term>Void</Term> the invoice. Its entries go back to Approved so they can be corrected and billed again. The voided number is never reused, which keeps your numbering clean for your accountant.</li>
          </Points>
          <Tip>Fill in your GST number and bank details under <Go href="/portal/admin/settings">Company &amp; GST</Go> before sending your first invoice. The invoice page warns you while they&apos;re missing.</Tip>
        </>
      ),
    },
    {
      id: "audit",
      title: "The audit log",
      audience: "admin",
      body: (
        <p>
          <Go href="/portal/admin/audit">Setup → Audit log</Go> records every change to time entries, rates, projects, staff, invoices and settings: who made it, when, and the value before and after.
          Filter it by what was changed. Nothing in the log can be edited or removed.
        </p>
      ),
    },
  ];

  const visible = sections.filter((s) => s.audience === "everyone" || (s.audience === "approver" && approver) || (s.audience === "admin" && admin));
  const groups = (["everyone", "approver", "admin"] as Audience[])
    .map((a) => ({ audience: a, items: visible.filter((s) => s.audience === a) }))
    .filter((g) => g.items.length > 0);
  const roleName = admin ? "an admin" : approver ? "an approver" : "a staff member";

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
      <nav aria-label="Guide contents" className="lg:sticky lg:top-6 lg:w-60 lg:shrink-0">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">In this guide</h2>
        {groups.map((g) => (
          <div key={g.audience} className="mt-4">
            {groups.length > 1 ? <p className="mb-1 text-[13px] font-semibold text-ink">{AUDIENCE_LABEL[g.audience]}</p> : null}
            <ul className="flex flex-col border-l border-line">
              {g.items.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1 pl-3 text-sm text-muted hover:border-ink hover:text-ink">{s.title}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-semibold">How to use the portal</h1>
        <p className="mt-2 max-w-[65ch] text-muted">
          You&apos;re signed in as {roleName}, so this guide covers what you can do{approver ? ", from entering your own time through to the tools only your role has" : ""}.
          Everything here works the same on a phone.
        </p>

        <div className="mt-8 flex flex-col gap-10">
          {visible.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-6 max-w-[70ch] text-[15px] leading-relaxed text-text">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 id={`${s.id}-title`} className="text-xl font-semibold">{s.title}</h2>
                {groups.length > 1 ? <span className={`chip ${AUDIENCE_CHIP[s.audience]}`}>{AUDIENCE_LABEL[s.audience]}</span> : null}
              </div>
              <div className="mt-3">{s.body}</div>
            </section>
          ))}
        </div>

        <p className="mt-12 max-w-[70ch] border-t border-line pt-5 text-sm text-muted">
          Something not working, or not covered here? {admin ? "Contact BedRock IT: info@bedrock-it.co.nz or 021 0235 5670." : "Talk to Gajan first. For technical problems the portal is supported by BedRock IT."}
        </p>
      </div>
    </div>
  );
}

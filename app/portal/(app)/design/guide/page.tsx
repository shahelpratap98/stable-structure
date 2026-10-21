import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin, requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Design guide" };

function H({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-xl font-semibold text-ink">
      {children}
    </h2>
  );
}
function Steps({ children }: { children: ReactNode }) {
  return <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 marker:font-semibold marker:text-ink">{children}</ol>;
}
function Points({ children }: { children: ReactNode }) {
  return <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 marker:text-muted">{children}</ul>;
}
function T({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink">{children}</span>;
}
function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[15px]">
      <T>Good to know: </T>
      {children}
    </p>
  );
}
function Card({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-line bg-surface p-5 leading-relaxed sm:p-6">{children}</section>;
}

const SECTIONS = [
  ["start", "Starting a job"],
  ["plans", "Plans, scale and levels"],
  ["drawing", "Drawing the structure"],
  ["walls", "Walls, openings and lintels"],
  ["loads", "What each member carries"],
  ["sizing", "How members are sized"],
  ["results", "Reading the results"],
  ["bracing", "Bracing and retaining walls"],
  ["views", "3D, sheets and IFC"],
  ["signoff", "Checking and sign-off"],
  ["report", "The council report"],
  ["history", "Saving and history"],
] as const;

export default async function DesignGuidePage() {
  const profile = await requireProfile();
  const admin = isAdmin(profile.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm">
          <Link href="/portal/design" className="font-semibold text-accent-600 hover:underline">
            ← Design
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Using the design app</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Lay a structure out over the architect&apos;s plans, let the app size every member, see it in 3D, have a CPEng check and sign it, and download the calculations for council.
        </p>
      </div>

      <nav aria-label="On this page" className="rounded-xl border border-line bg-surface p-5">
        <ol className="grid list-decimal gap-x-8 gap-y-1 pl-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`} className="font-semibold text-accent-600 hover:underline">
                {title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Card>
        <H id="start">1. Starting a job</H>
        <p className="mt-2">
          On the <Link href="/portal/design" className="font-semibold text-accent-600 hover:underline">Design</Link> page, fill in <T>New design job</T> with a name, the job number and the site
          address, and link it to a timesheet project if there is one. You can change these later on the editor&apos;s <T>Levels</T> tab.
        </p>
        <p className="mt-2">
          Every active staff member can open and edit every design job. {admin ? "Only admins can delete a job." : "Only an admin can delete a job."}
        </p>
      </Card>

      <Card>
        <H id="plans">2. Plans, scale and levels</H>
        <Steps>
          <li>
            Open the <T>Levels</T> tab and upload the architect&apos;s PDF (up to 50 MB). Pick the page that shows each level&apos;s plan.
          </li>
          <li>
            Choose the <T>Scale</T> tool (S), click both ends of a dimension you know, and type its real length in millimetres. A long dimension gives the best accuracy.
          </li>
          <li>
            Choose <T>Origin</T> (O) and click the same corner of the building on every level, so the levels stack correctly in 3D.
          </li>
          <li>Check each level&apos;s elevation, stud height and whether its walls stand on a slab or a timber floor (that changes the bracing ratings).</li>
        </Steps>
        <Tip>
          Each level holds that storey&apos;s posts and walls, plus the framing at its top. Ground floor joists and bearers go on <T>Foundation</T>; first floor joists go on
          the ground floor level. You can start drawing on the 1 m grid before plans arrive.
        </Tip>
      </Card>

      <Card>
        <H id="drawing">3. Drawing the structure</H>
        <p className="mt-2">Pick a tool from the left (or its key), then click the start and end of a member on the plan. Posts, piles and footings take one click.</p>
        <Points>
          <li>
            <T>Beams, lintels, joists and rafters</T> (B, L, J, R) are lines. Hold <T>Shift</T> for 15° steps; ends snap to other members.
          </li>
          <li>
            <T>Joist zones</T> (Z) are rectangles: drag across the area. Joists run the shorter way; change the direction, spacing and wet area on the <T>Joists</T> panel.
          </li>
          <li>
            <T>Posts</T> (P) sit under beam ends. The app works out what lands on each post, including beams and posts on the levels above.
          </li>
          <li>
            <T>Bracing elements</T> (G), <T>pad footings</T> (F), <T>timber piles</T> (I) and <T>retaining walls</T> (T) work the same way. A{" "}
            <T>deck</T> (D) is drawn corner to corner and designs its joists, bearers and piles; a <T>stair</T> (E) is drawn from its foot to its head. A{" "}
            <T>rib raft slab</T> (K) is drawn like a joist zone, corner to corner, and carries the walls and posts standing on it. A{" "}
            <T>joist zone</T> drawn on the top storey is roof framing: choose gable, hip, mono or flat, the pitch, eaves and purlins, and rafters (designed) or trusses (by the supplier).
            The beams and walls along its eaves and ridge pick up the roof load.
          </li>
          <li>
            <T>Select</T> (V) to pick, drag to move, or drag an end to stretch. <T>Del</T> deletes, <T>Ctrl+D</T> duplicates, <T>Ctrl+C / V</T> copy and paste, <T>Ctrl+Z / Y</T> undo and redo.
          </li>
        </Points>
        <Tip>
          When a beam ends part-way along another beam (not on a post), its reaction is passed to that beam as a point load. The carrying beam&apos;s calculation lists every point load it
          takes and where.
        </Tip>
      </Card>

      <Card>
        <H id="walls">4. Walls, openings and lintels</H>
        <p className="mt-2">
          Draw walls with <T>Wall</T> (W) and set the type (external, internal or block), thickness, cladding, stud spacing and whether it&apos;s loadbearing. Then use <T>Opening</T> (N):
          click along a wall where a door or window starts and ends.
        </p>
        <p className="mt-2">
          Every opening makes its own lintel, sized automatically from the width and what the wall carries. Click the opening to set its sill, tributary loads or a fixed size.
          Openings on upper levels are marked LF.
        </p>
      </Card>

      <Card>
        <H id="loads">5. What each member carries</H>
        <p className="mt-2">
          Select a beam or lintel and fill in its loaded widths: floor, extra wet area, roof (on plan) and the number of external and internal walls sitting on it. The calculation shows
          the line loads that come from these.
        </p>
        <p className="mt-2">
          The <T>Loads</T> tab holds the job&apos;s design loads (floor and roof dead and live, snow, wall weights, the midspan point load and deflection limits), the bracing demand per
          level, and a list of <T>assumptions to confirm</T>. Those assumptions print in the council report, so keep them current.
        </p>
      </Card>

      <Card>
        <H id="sizing">6. How members are sized</H>
        <p className="mt-2">
          Beams, lintels and posts are <T>automatic</T> unless you fix a size. The app tries sections in order (SG8 timber, then hySPAN LVL, then steel PFC, UB and UC, lightest first within each) and picks the first
          that passes every check. Limit the families, the depth or the width on the member&apos;s sizing panel, for example to keep a floor beam flush with 240 joists.
        </p>
        <Points>
          <li>Combinations: 1.35G, 1.2G + 1.5Q, 1.2G + 1.5Qr + 0.4Q and 1.2G + Su + 0.4Q, with the matching k1 duration factors.</li>
          <li>Checks: bending, shear, long-term deflection (span/300 and the absolute cap), short-term deflection (span/360) and deflection under the 1 kN point load.</li>
          <li>Posts: SG8 stud packs then SHS, checked for buckling and bearing, with their height taken to the underside of the deepest beam they carry.</li>
          <li>Joists: span table check plus bending, shear and deflection; the hanger reaction per joist is shown.</li>
        </Points>
        <Tip>Everything is preliminary until a CPEng has checked it. Members outside NZS 3604 (hySPAN, steel, posts carrying beams) are specific design and need a PS1.</Tip>
      </Card>

      <Card>
        <H id="results">7. Reading the results</H>
        <p className="mt-2">
          Colour the views by <T>Result</T> to see at a glance: green passes, amber is close to the limit (over 90 %), red fails. Select any member to see its calculation: the chosen
          section, a bar for each check, the governing combination, the sections that were tried and why they failed, and the loads.
        </p>
        <p className="mt-2">
          The <T>Overview</T> lists anything that needs attention; the <T>Schedule</T> tab lists every member. A member with no check (a wall or footing without a calc) is grey.
        </p>
      </Card>

      <Card>
        <H id="bracing">8. Bracing and retaining walls</H>
        <p className="mt-2">
          Draw each bracing element along its wall and pick the GIB EzyBrace system. Elements are grouped into bracing lines (A, B… along; 1, 2… across). Each line is checked against
          its minimum (the greater of 100 BU, half the demand over the number of lines, and 15 BU per metre of external wall), and the level total against the demand you enter on the
          <T> Loads</T> tab.
        </p>
        <p className="mt-2">Retaining walls are either timber pole walls (sized by height band) or block walls; set the retained height at each end.</p>
      </Card>

      <Card>
        <H id="views">9. 3D, sheets and IFC</H>
        <Points>
          <li>
            <T>Plan + 3D</T> shows both side by side; <T>3D</T> on its own has layer switches, preset views (top, north, south…) and an explode slider to pull the levels apart.
          </li>
          <li>
            <T>Sheets</T> is the long-form schedule: members, joists, lintels, posts and foundations, walls, bracing sheets and retaining walls. Click a row to jump to the member.
          </li>
          <li>
            <T>Download IFC</T> exports the model for Revit, ArchiCAD or AutoCAD (IFC4), with each member&apos;s mark and section.
          </li>
          <li>
            On a phone or narrow screen, the details panel opens from the <T>Details</T> button in the top bar.
          </li>
        </Points>
      </Card>

      <Card>
        <H id="signoff">10. Checking and sign-off</H>
        <Steps>
          <li>
            When the design is complete and everything passes, open the <T>Sign-off</T> tab. Pick the designer and a CPEng to check it (not the designer), add a note if it helps,
            and choose <T>Submit for checking</T>.
          </li>
          <li>
            The checker opens the job and reviews it. They either <T>send it back</T> with comments (it returns to draft) or <T>sign off</T> the exact revision they reviewed. If
            anyone saves after the checker opened it, signing is refused until they reload and check the latest.
          </li>
          <li>A signed job is locked: nobody can change it. Its report carries the signature, date and revision.</li>
        </Steps>
        <p className="mt-3">
          You can keep working while a job is in review; the checker signs whatever the latest revision is. The designer or an admin can also withdraw it from review.
        </p>
        {admin ? (
          <>
            <h3 className="mt-5 text-base font-semibold text-ink">For admins</h3>
            <Points>
              <li>
                Add each Chartered Professional Engineer and their registration number under <T>Chartered engineers</T> on the{" "}
                <Link href="/portal/design" className="font-semibold text-accent-600 hover:underline">Design</Link> page. Only they can be picked as checker and sign.
              </li>
              <li>
                To change a signed job, open its <T>Sign-off</T> tab and choose <T>Reopen for changes</T> with a reason. The signature is removed (it stays in the audit log) and
                the job must be checked and signed again.
              </li>
            </Points>
          </>
        ) : null}
      </Card>

      <Card>
        <H id="report">11. The council report</H>
        <p className="mt-2">
          On the <T>Sign-off</T> tab, <T>Download report (PDF)</T> builds the calculations package in your browser. It has the company logo on every sheet, a cover with the
          designer, checker and sign-off, a design features report (scope, standards, importance level, loads, wind, earthquake, ground, durability), the design basis and loads, the
          member schedule, the bracing summary, the connection schedule, typical details for the connections and foundations the job uses, a marked-up framing plan for every level
          (over the architect&apos;s plan where it&apos;s placed to scale), a 3D view and the full calculation for every member.
        </p>
        <p className="mt-2">
          At the end are the <T>PS1 details</T> (fill them in under <T>Consent paperwork</T> on the <T>Sign-off</T> tab) and the engine verification. The PS1 page is information
          for the official Engineering New Zealand form, in the same order: the design professional copies it to that form, checks it and signs the form itself.
        </p>
        <p className="mt-2">
          To issue a revision, open the <T>History</T> tab and choose <T>Compare</T> on the revision you last issued. The changes are listed and boxed on the plan, and a report
          downloaded while comparing adds a <T>Changes since revision N</T> page and revision clouds on the framing plans.
        </p>
        <p className="mt-2">
          Until the job is signed, every page is watermarked <T>DRAFT</T> and the file name ends in -DRAFT. Download it again after sign-off for the version to lodge.
        </p>
      </Card>

      <Card>
        <H id="history">12. Saving and history</H>
        <p className="mt-2">
          Changes save automatically a moment after you make them; the top bar shows <T>Saved · rev N</T>. Every save is kept on the <T>History</T> tab with what changed and who
          changed it, and any earlier revision can be restored (restoring is itself a new revision, so nothing is lost). <T>Compare</T> shows what changed since an earlier revision
          without restoring it.
        </p>
        <p className="mt-2">
          The{" "}
          <Link href="/portal/design/verification" className="font-semibold text-accent-600 hover:underline">
            engine verification
          </Link>{" "}
          page runs the design engine against textbook formulas, published capacity tables, hand calculations and past Stable Structure jobs, and shows each answer beside the
          expected one.
        </p>
        <p className="mt-2">
          If someone else saves the same job while you have it open, the top bar shows <T>Changed elsewhere</T>. Reload to get their changes; anything you changed since your last save
          is lost, so agree who is editing a job at any one time.
        </p>
      </Card>
    </div>
  );
}

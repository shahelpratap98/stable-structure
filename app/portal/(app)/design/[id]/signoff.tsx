"use client";

import { useState, useTransition } from "react";
import { Spinner } from "@/components/spinner";
import { reopenDesign, returnDesign, signDesign, submitDesign, type FlowResult } from "../actions";
import { Section } from "./panels";

export type Person = { id: string; name: string; cpeng: string };
export type Signoff = {
  designerId: string | null;
  checkerId: string | null;
  submittedAt: string | null;
  signedBy: string | null;
  signedAt: string | null;
  signedRevision: number | null;
  note: string;
  people: Person[];
  me: string;
  isAdmin: boolean;
};
export type Status = "draft" | "in_review" | "signed";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export function personLabel(people: Person[], id: string | null) {
  const p = people.find((x) => x.id === id);
  if (!p) return "–";
  return p.cpeng ? `${p.name} (CPEng ${p.cpeng})` : p.name;
}

export function SignoffPanel({
  jobId,
  status,
  signoff,
  revision,
  saved,
  fails,
  onReport,
  reporting,
}: {
  jobId: string;
  status: Status;
  signoff: Signoff | null;
  revision: number;
  saved: boolean;
  fails: number;
  onReport: () => void;
  reporting: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [designer, setDesigner] = useState(signoff?.designerId ?? signoff?.me ?? "");
  const [checker, setChecker] = useState(signoff?.checkerId ?? "");
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<FlowResult>) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (r.ok) window.location.reload();
      else setError(r.message);
    });

  const report = (
    <Section title="Council report">
      <p className="text-sm text-muted">
        A PDF of the design: cover, design basis, member schedule, bracing, marked-up plans, a 3D view and every calc sheet.
        {status === "signed" ? "" : " It is watermarked DRAFT until the job is signed."}
      </p>
      <button type="button" className="btn btn-primary mt-3 self-start" onClick={onReport} disabled={reporting}>
        {reporting ? (
          <>
            <Spinner /> Building PDF…
          </>
        ) : (
          "Download report (PDF)"
        )}
      </button>
    </Section>
  );

  if (!signoff)
    return (
      <>
        <Section title="Review and sign-off">
          <p className="text-sm text-warn">
            Sign-off isn&apos;t switched on yet. Run migration <code>20261018001100_design_signoff.sql</code> in the Supabase SQL editor.
          </p>
        </Section>
        {report}
      </>
    );

  const { people, me, isAdmin } = signoff;
  const engineers = people.filter((p) => p.cpeng && p.id !== designer);
  const notSaved = !saved ? <p className="text-xs text-warn">Waiting for the latest changes to save.</p> : null;
  const err = error ? (
    <p className="text-sm font-semibold text-bad" role="alert">
      {error}
    </p>
  ) : null;

  const facts = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted">Status</dt>
      <dd className="font-semibold">{status === "draft" ? "Draft" : status === "in_review" ? "Waiting for check" : "Signed off"}</dd>
      {signoff.designerId ? (
        <>
          <dt className="text-muted">Designer</dt>
          <dd>{personLabel(people, signoff.designerId)}</dd>
        </>
      ) : null}
      {signoff.checkerId ? (
        <>
          <dt className="text-muted">Checker</dt>
          <dd>{personLabel(people, signoff.checkerId)}</dd>
        </>
      ) : null}
      {signoff.submittedAt ? (
        <>
          <dt className="text-muted">Submitted</dt>
          <dd>{when(signoff.submittedAt)}</dd>
        </>
      ) : null}
      {status === "signed" ? (
        <>
          <dt className="text-muted">Signed</dt>
          <dd>
            {personLabel(people, signoff.signedBy)}, {when(signoff.signedAt)}, revision {signoff.signedRevision}
          </dd>
        </>
      ) : null}
      {signoff.note ? (
        <>
          <dt className="text-muted">Note</dt>
          <dd className="whitespace-pre-wrap">{signoff.note}</dd>
        </>
      ) : null}
    </dl>
  );

  const noteBox = (label: string, placeholder: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <textarea className="field min-h-16 py-1.5 text-sm" maxLength={900} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
    </label>
  );

  let body = null;
  if (status === "draft") {
    body = (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Designer</span>
          <select className="field py-1.5 text-sm" value={designer} onChange={(e) => setDesigner(e.target.value)}>
            <option value="">Pick…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Checker (CPEng)</span>
          <select className="field py-1.5 text-sm" value={engineers.some((p) => p.id === checker) ? checker : ""} onChange={(e) => setChecker(e.target.value)}>
            <option value="">Pick…</option>
            {engineers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · CPEng {p.cpeng}
              </option>
            ))}
          </select>
          {engineers.length === 0 ? <span className="text-xs text-warn">No CPEng set up yet. An admin adds them on the Design page.</span> : null}
        </label>
        {noteBox("Note for the checker (optional)", "e.g. B4 carries the deck; check the bearing at P2")}
        {fails ? <p className="text-xs text-warn">{fails} {fails === 1 ? "member fails" : "members fail"}. The checker can&apos;t sign until everything passes.</p> : null}
        {revision === 0 ? <p className="text-xs text-muted">Draw the structure first.</p> : null}
        {notSaved}
        <button
          type="button"
          className="btn btn-primary self-start"
          disabled={pending || !saved || revision === 0 || !designer || !engineers.some((p) => p.id === checker)}
          onClick={() => run(() => submitDesign(jobId, designer, checker, note))}
        >
          {pending ? <Spinner /> : null} Submit for checking
        </button>
      </div>
    );
  } else if (status === "in_review") {
    const isChecker = me === signoff.checkerId;
    const canReturn = isChecker || me === signoff.designerId || isAdmin;
    body = (
      <div className="flex flex-col gap-3">
        {isChecker ? (
          <div className="rounded-lg border border-line bg-surface-2/60 p-3 text-sm">
            <p>
              By signing you confirm you have checked revision <b>{revision}</b> of this design and its calculations, and that it is ready to issue for building consent.
            </p>
            {fails ? <p className="mt-2 text-bad">{fails} {fails === 1 ? "member fails" : "members fail"}. Send it back, or fix it, before signing.</p> : null}
            {notSaved}
            <button
              type="button"
              className="btn btn-primary mt-3"
              disabled={pending || !saved || fails > 0}
              onClick={() => {
                if (window.confirm(`Sign off revision ${revision}? The job will be locked.`)) run(() => signDesign(jobId, revision));
              }}
            >
              {pending ? <Spinner /> : null} Sign off revision {revision}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Waiting for {personLabel(people, signoff.checkerId)} to check and sign. You can keep working; they sign the latest revision.</p>
        )}
        {canReturn ? (
          <>
            {noteBox(isChecker ? "Comments for the designer" : "Why withdraw? (optional)", isChecker ? "What needs changing" : "")}
            <button type="button" className="btn btn-quiet self-start" disabled={pending} onClick={() => run(() => returnDesign(jobId, note))}>
              {isChecker ? "Send back to the designer" : "Withdraw from review"}
            </button>
          </>
        ) : null}
      </div>
    );
  } else if (isAdmin) {
    body = (
      <div className="flex flex-col gap-3">
        {noteBox("Reason for reopening", "e.g. Client changed the deck; revision B")}
        <button
          type="button"
          className="btn btn-quiet self-start text-bad"
          disabled={pending || !note.trim()}
          onClick={() => {
            if (window.confirm("Reopen this job? The signature is removed and it must be checked and signed again.")) run(() => reopenDesign(jobId, note));
          }}
        >
          Reopen for changes
        </button>
      </div>
    );
  }

  return (
    <>
      <Section title="Review and sign-off">
        <div className="flex flex-col gap-4">
          {facts}
          {body}
          {err}
        </div>
      </Section>
      {report}
    </>
  );
}

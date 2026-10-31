"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadKind, runCalcs, type Calcs } from "@/lib/design/calc";
import { gapsFor, openGaps } from "@/lib/design/complete";
import { cloudsOn, diffModels } from "@/lib/design/diff";
import { defaultRaft } from "@/lib/design/raft";
import { defaultDeck, defaultStair } from "@/lib/design/deck";
import { joinWallRuns } from "@/lib/design/walls";
import { matchPlanPages } from "@/lib/design/plan-pages";
import { exportIfc } from "@/lib/design/ifc";
import { FAMILY_COLOUR, FAMILY_LABEL } from "@/lib/design/materials";
import {
  defaultRoof,
  DEFAULT_SECTION,
  defaultWall,
  defaultZone,
  MEMBER_INFO,
  MEMBER_TYPES,
  newId,
  nextLabel,
  nextMark,
  type DesignModel,
  type DesignParams,
  type Level,
  type Member,
  type MemberType,
  type Opening,
  type Pt,
} from "@/lib/design/model";
import { createClient } from "@/lib/supabase/browser";
import { loadRevision, registerPlan, saveDesign } from "../actions";
import { HistoryPanel, JobSection, LevelsPanel, MemberPanel, OpeningPanel, BulkPanel, ChangesPanel, GridPanel, Overview, PaperworkPanel, ParamsPanel, SchedulePanel, SitePanel, type PlanFile } from "./panels";
import { countPages, findLines, labelLines, loadPdf, pageTexts, pageWords, renderPage, type FoundLine, type RenderedPage } from "./pdf";
import { GRID_FRAME, PlanView, toPdf, toWorld, type Tool } from "./plan-view";
import { Sheets } from "./sheets";
import { SignoffPanel, type Signoff } from "./signoff";
import type { ColourBy } from "./view-3d";

// three.js only loads when the 3D view is first shown.
const View3D = dynamic(() => import("./view-3d").then((m) => m.View3D), {
  ssr: false,
  loading: () => <p className="grid h-full place-items-center text-sm text-muted">Loading 3D…</p>,
});

type Job = { id: string; title: string; jobNo: string; address: string; status: "draft" | "in_review" | "signed" };
type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error" | "locked";
type Tab = "member" | "schedule" | "levels" | "loads" | "history" | "signoff";
type ViewMode = "plan" | "3d" | "split" | "sheets";

const BEAM_LIKE: MemberType[] = ["beam", "lintel", "joist", "rafter"];

function newMember(model: DesignModel, type: MemberType, levelId: string, a: Pt, b?: Pt): Member {
  const m: Member = {
    id: newId(),
    type,
    label: nextLabel(model, type),
    levelId,
    a,
    ...(b ? { b } : {}),
    material: "timber",
    ...(BEAM_LIKE.includes(type) || type === "post" || type === "joistzone" ? { grade: "SG8" as const } : {}),
    section: DEFAULT_SECTION[type],
    ...(type === "joist" ? { spacing: 400 } : type === "rafter" ? { spacing: 900 } : {}),
    ...(type === "beam" ? { sizing: { mode: "auto" as const } } : {}),
    ...(type === "lintel" ? { sizing: { mode: "auto" as const, maxB: 90 } } : {}),
    ...(type === "post" ? { sizing: { mode: "auto" as const } } : {}),
    ...(type === "wall" ? { wall: defaultWall() } : {}),
    ...(type === "bracing" ? { brace: { system: "GS2N" as const } } : {}),
    ...(type === "retaining" ? { rw: { kind: "pole" as const, h0: 1, h1: 1 } } : {}),
    ...(type === "raft" ? { material: "concrete" as const, raft: defaultRaft() } : {}),
    ...(type === "deck" ? { grade: "SG8" as const, deck: defaultDeck() } : {}),
    ...(type === "stair" ? { grade: "SG8" as const, stair: defaultStair() } : {}),
  };
  if (MEMBER_INFO[type].area && b) {
    // joists span the shorter way across the zone
    // deck joists span the shorter way, like a joist zone
    if (type === "deck" && m.deck) m.deck = { ...m.deck, dir: Math.abs(b.y - a.y) <= Math.abs(b.x - a.x) ? "y" : "x" };
    if (type === "joistzone") {
      m.zone = { ...defaultZone(), dir: Math.abs(b.y - a.y) <= Math.abs(b.x - a.x) ? "y" : "x" };
      // over the top storey it is roof framing: rafters at 900 to a ridge
      if (loadKind(model, model.levels.find((l) => l.id === levelId)) === "roof") {
        m.zone = { ...m.zone, spacing: 900, roof: defaultRoof() };
        m.section = "190x45";
      }
    }
    m.a = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
    m.b = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  }
  return m;
}

export function DesignEditor({
  job,
  initialModel,
  initialRevision,
  initialPlans,
  canDelete,
  signoff,
  company,
}: {
  job: Job;
  signoff: Signoff | null;
  company: string;
  initialModel: DesignModel;
  initialRevision: number;
  initialPlans: PlanFile[];
  canDelete: boolean;
}) {
  const [reporting, setReporting] = useState(false);
  const locked = job.status === "signed";
  const [model, setModel] = useState(initialModel);
  const modelRef = useRef(model); // kept in step by commit / undo / redo
  const undoStack = useRef<DesignModel[]>([]);
  const redoStack = useRef<DesignModel[]>([]);
  const [stacks, setStacks] = useState({ undo: 0, redo: 0 });
  const syncStacks = () => setStacks({ undo: undoStack.current.length, redo: redoStack.current.length });

  const [revision, setRevision] = useState(initialRevision);
  const revisionRef = useRef(initialRevision);
  const [save, setSave] = useState<SaveState>(locked ? "locked" : "saved");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveTick, setSaveTick] = useState(0);
  const pendingSummary = useRef<string[]>([]);
  const inFlight = useRef(false);

  const [plans, setPlans] = useState(initialPlans);
  const [activeLevelId, setActiveLevelId] = useState(() => (initialModel.levels.find((l) => l.kind === "floor") ?? initialModel.levels[0]).id);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]); // several members selected for a bulk change
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [tab, setTab] = useState<Tab>("member");
  const [panelOpen, setPanelOpen] = useState(false); // side panel drawer on narrow screens
  const [mode, setMode] = useState<ViewMode>("split");
  const [colourBy, setColourBy] = useState<ColourBy>("type");
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [scalePick, setScalePick] = useState<{ p1: Pt; p2: Pt } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");
  const clipboard = useRef<Member | null>(null);

  const calcs = useMemo(() => runCalcs(model), [model]);
  const results = calcs.results;

  // a short pop-up when an edit leaves a member with no load path
  const [toast, setToast] = useState<{ text: string; id: string } | null>(null);
  const wasUnstable = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = [...results.values()].filter((r) => r.unstable);
    const seen = wasUnstable.current;
    wasUnstable.current = new Set(now.map((r) => r.memberId));
    const fresh = seen ? now.filter((r) => !seen.has(r.memberId)) : [];
    if (fresh.length) setToast({ text: fresh.length === 1 ? `${fresh[0].mark} is unstable: ${fresh[0].unstable}` : `Now unstable: ${fresh.map((r) => r.mark).join(", ")}`, id: fresh[0].memberId });
  }, [results]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // an earlier revision to compare against: its changes are boxed on the plan and clouded in the report
  const [base, setBase] = useState<{ revision: number; model: DesignModel; calcs: Calcs } | null>(null);
  const changes = useMemo(() => (base ? diffModels(base.model, base.calcs, model, calcs) : []), [base, model, calcs]);
  const level = model.levels.find((l) => l.id === activeLevelId) ?? model.levels[0];
  const selected = model.members.find((m) => m.id === selectedId) ?? null;
  const selectedLintel = selectedId?.includes("#") ? (calcs.lintels.find((l) => l.id === selectedId) ?? null) : null;

  // ------------------------------------------------------------ editing

  const commit = useCallback(
    (next: DesignModel, summary: string) => {
      if (locked) return;
      undoStack.current.push(modelRef.current);
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
      modelRef.current = next;
      setModel(next);
      pendingSummary.current.push(summary);
      setSave("dirty");
      syncStacks();
    },
    [locked],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev || locked) return;
    redoStack.current.push(modelRef.current);
    modelRef.current = prev;
    setModel(prev);
    pendingSummary.current.push("Undo");
    setSave("dirty");
    syncStacks();
  }, [locked]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next || locked) return;
    undoStack.current.push(modelRef.current);
    modelRef.current = next;
    setModel(next);
    pendingSummary.current.push("Redo");
    setSave("dirty");
    syncStacks();
  }, [locked]);

  // bulk changes to several members in one step (one undo, one history entry)
  const patchMany = useCallback(
    (ids: string[], patch: (m: Member) => Partial<Member> | null, summary: string) => {
      const m = modelRef.current;
      const set = new Set(ids);
      commit({ ...m, members: m.members.map((x) => (set.has(x.id) ? { ...x, ...(patch(x) ?? {}) } : x)) }, summary);
    },
    [commit],
  );
  const removeMany = useCallback(
    (ids: string[]) => {
      const m = modelRef.current;
      const set = new Set(ids);
      commit({ ...m, members: m.members.filter((x) => !set.has(x.id)) }, `Deleted ${ids.length} members`);
      setSelectedId(null);
      setMulti([]);
    },
    [commit],
  );

  const updateMember = useCallback(
    (id: string, patch: Partial<Member>, summary: string) => {
      const m = modelRef.current;
      commit({ ...m, members: m.members.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, summary);
    },
    [commit],
  );

  const removeMember = useCallback(
    (id: string) => {
      const m = modelRef.current;
      const victim = m.members.find((x) => x.id === id);
      if (!victim) return;
      commit({ ...m, members: m.members.filter((x) => x.id !== id) }, `Deleted ${victim.label}`);
      setSelectedId(null);
    },
    [commit],
  );

  const updateOpening = useCallback(
    (lintelId: string, patch: Partial<Opening>, summary: string) => {
      const [wallId, opId] = lintelId.split("#");
      const m = modelRef.current;
      commit(
        { ...m, members: m.members.map((x) => (x.id === wallId && x.wall ? { ...x, wall: { ...x.wall, openings: x.wall.openings.map((o) => (o.id === opId ? { ...o, ...patch } : o)) } } : x)) },
        summary,
      );
    },
    [commit],
  );

  const removeOpening = useCallback(
    (lintelId: string) => {
      const [wallId, opId] = lintelId.split("#");
      const m = modelRef.current;
      const wall = m.members.find((x) => x.id === wallId);
      const op = wall?.wall?.openings.find((o) => o.id === opId);
      if (!wall?.wall || !op) return;
      commit({ ...m, members: m.members.map((x) => (x.id === wallId && x.wall ? { ...x, wall: { ...x.wall, openings: x.wall.openings.filter((o) => o.id !== opId) } } : x)) }, `Removed opening ${op.label}`);
      setSelectedId(wallId);
    },
    [commit],
  );

  const addOpening = (wallId: string, s0: number, s1: number) => {
    const m = modelRef.current;
    const wall = m.members.find((x) => x.id === wallId);
    if (!wall?.wall) return;
    const prefix = (m.levels.find((l) => l.id === wall.levelId)?.elevation ?? 0) > 0.5 ? "LF" : "L";
    const op: Opening = { id: newId().slice(0, 8), label: nextMark(m, prefix), offset: s0, width: s1 - s0, sill: 0.9 };
    commit({ ...m, members: m.members.map((x) => (x.id === wallId && x.wall ? { ...x, wall: { ...x.wall, openings: [...x.wall.openings, op] } } : x)) }, `Added opening ${op.label} to ${wall.label}`);
    setSelectedId(`${wallId}#${op.id}`);
    setTab("member");
  };

  const placeCopy = useCallback(
    (source: Member, offset: Pt, levelId = source.levelId) => {
      const m = modelRef.current;
      const copy: Member = {
        ...source,
        id: newId(),
        levelId,
        label: nextLabel(m, source.type),
        a: { x: source.a.x + offset.x, y: source.a.y + offset.y },
        ...(source.b ? { b: { x: source.b.x + offset.x, y: source.b.y + offset.y } } : {}),
      };
      commit({ ...m, members: [...m.members, copy] }, `Copied ${source.label} to ${copy.label}`);
      setSelectedId(copy.id);
    },
    [commit],
  );

  const createMember = (type: MemberType, a: Pt, b?: Pt) => {
    const m = modelRef.current;
    const member = newMember(m, type, level.id, a, b);
    commit({ ...m, members: [...m.members, member] }, `Added ${member.label}`);
    setSelectedId(member.id);
    setTab("member");
  };

  const updateLevel = (id: string, patch: Partial<Level>, summary: string) => {
    const m = modelRef.current;
    commit({ ...m, levels: m.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)) }, summary);
  };

  // Re-anchor a level's members when its plan scale or origin changes, so they
  // stay on the same spot of the drawing.
  const replacePlacement = (lvl: Level, scale: number | null, origin: Pt, summary: string) => {
    if (!lvl.plan) return;
    const m = modelRef.current;
    const before = { scale: lvl.plan.scale ?? GRID_FRAME.scale, origin: lvl.plan.origin };
    const after = { scale: scale ?? GRID_FRAME.scale, origin };
    const move = (p: Pt) => toWorld(after, toPdf(before, p));
    commit(
      {
        ...m,
        levels: m.levels.map((l) => (l.id === lvl.id && l.plan ? { ...l, plan: { ...l.plan, scale, origin } } : l)),
        members: m.members.map((x) => (x.levelId === lvl.id ? { ...x, a: move(x.a), ...(x.b ? { b: move(x.b) } : {}) } : x)),
      },
      summary,
    );
  };

  const addLevel = () => {
    const m = modelRef.current;
    const top = [...m.levels].sort((a, b) => b.elevation - a.elevation)[0];
    const lvl: Level = { id: newId(), name: "New level", kind: "floor", floor: "timber", elevation: top ? +(top.elevation + top.height).toFixed(3) : 0, height: 2.4, plan: null };
    commit({ ...m, levels: [...m.levels, lvl] }, "Added a level");
    setActiveLevelId(lvl.id);
  };

  const deleteLevel = (id: string) => {
    const m = modelRef.current;
    const lvl = m.levels.find((l) => l.id === id);
    const count = m.members.filter((x) => x.levelId === id).length;
    if (!lvl || m.levels.length < 2) return;
    if (count && !window.confirm(`Remove ${lvl.name} and its ${count} ${count === 1 ? "member" : "members"}?`)) return;
    commit({ ...m, levels: m.levels.filter((l) => l.id !== id), members: m.members.filter((x) => x.levelId !== id) }, `Removed level ${lvl.name}`);
    if (activeLevelId === id) setActiveLevelId(m.levels.find((l) => l.id !== id)!.id);
  };

  const pick = (id: string | null, fromElsewhere = false) => {
    setSelectedId(id);
    setMulti([]);
    if (!id) return;
    setTab("member");
    const mem = modelRef.current.members.find((x) => x.id === id.split("#")[0]);
    if (mem && fromElsewhere) {
      if (mem.levelId !== activeLevelId) setActiveLevelId(mem.levelId);
      setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    }
  };

  // ------------------------------------------------------------ saving

  const doSave = useCallback(async () => {
    if (inFlight.current || locked) return;
    inFlight.current = true;
    const snapshot = modelRef.current;
    const summaries = pendingSummary.current;
    pendingSummary.current = [];
    const unique = [...new Set(summaries)];
    const summary = unique.length > 3 ? `${unique.slice(0, 3).join("; ")} and ${unique.length - 3} more` : unique.join("; ");
    setSave("saving");
    const res = await saveDesign(job.id, revisionRef.current, snapshot, summary).catch((e: unknown) => ({ ok: false as const, reason: "error" as const, message: e instanceof Error ? e.message : "Couldn't reach the server." }));
    inFlight.current = false;
    if (res.ok) {
      revisionRef.current = res.revision;
      setRevision(res.revision);
      if (modelRef.current !== snapshot) {
        setSave("dirty");
        setSaveTick((t) => t + 1);
      } else setSave("saved");
      return;
    }
    pendingSummary.current = [...summaries, ...pendingSummary.current];
    setSaveMessage(res.message);
    if (res.reason === "conflict") setSave("conflict");
    else if (res.reason === "signed") setSave("locked");
    else {
      setSave("error");
      if (res.reason === "limit") setTimeout(() => setSave((s) => (s === "error" ? "dirty" : s)), 20000);
    }
  }, [job.id, locked]);

  useEffect(() => {
    if (save !== "dirty") return;
    const t = setTimeout(doSave, 1200);
    return () => clearTimeout(t);
  }, [model, save, saveTick, doSave]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving" || save === "error") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const compareWith = async (rev: number | null) => {
    if (rev === null) return setBase(null);
    const old = await loadRevision(job.id, rev);
    if (!old) return setNotice("That revision couldn't be loaded.");
    setBase({ revision: rev, model: old, calcs: runCalcs(old) });
  };

  const restore = async (rev: number) => {
    const old = await loadRevision(job.id, rev);
    if (!old) return setNotice("That revision couldn't be loaded.");
    commit(old, `Restored revision ${rev}`);
    if (!old.levels.some((l) => l.id === activeLevelId)) setActiveLevelId(old.levels[0].id);
    setSelectedId(null);
  };

  // ------------------------------------------------------------ plans

  const [rendered, setRendered] = useState<{ key: string; page: RenderedPage } | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const pageCache = useRef(new Map<string, RenderedPage>());
  const planKey = level.plan ? `${level.plan.planId}:${level.plan.page}` : "";

  useEffect(() => {
    if (!level.plan) return;
    const { planId, page } = level.plan;
    const key = `${planId}:${page}`;
    const cached = pageCache.current.get(key);
    if (cached) {
      setRendered({ key, page: cached });
      return;
    }
    const file = plans.find((p) => p.id === planId);
    if (!file) return;
    let live = true;
    setPageLoading(true);
    loadPdf(planId, file.url)
      .then((doc) => renderPage(doc, page))
      .then((r) => {
        pageCache.current.set(key, r);
        if (live) setRendered({ key, page: r });
      })
      .catch(() => live && setNotice(`Couldn't open ${file.fileName}. Try reloading the page.`))
      .finally(() => live && setPageLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, plans]);

  const page = rendered && rendered.key === planKey ? rendered.page : null;

  // Members found on the sheet's linework: previewed on the plan, added by colour.
  const [found, setFound] = useState<{ levelId: string; lines: FoundLine[] } | null>(null);
  const [finding, setFinding] = useState(false);
  const findOnSheet = async () => {
    if (!page || !level.plan?.scale) return setNotice("Place the plan and set its scale first (Levels tab), then find beams on it.");
    const file = plans.find((p) => p.id === level.plan!.planId);
    setFinding(true);
    try {
      const s = level.plan.scale;
      let lines = findLines(page, 1.0 / s); // at least 1 m long
      if (file) lines = labelLines(lines, await pageWords(await loadPdf(file.id, file.url), level.plan.page));
      // skip lines already drawn as members
      const mine = modelRef.current.members.filter((m) => m.levelId === level.id && m.b);
      const frameNow = { scale: s, origin: level.plan.origin };
      lines = lines.filter((l) => {
        const a = toWorld(frameNow, l.a),
          b = toWorld(frameNow, l.b);
        return !mine.some((m) => Math.hypot(m.a.x - a.x, m.a.y - a.y) + Math.hypot(m.b!.x - b.x, m.b!.y - b.y) < 0.6 || Math.hypot(m.a.x - b.x, m.a.y - b.y) + Math.hypot(m.b!.x - a.x, m.b!.y - a.y) < 0.6);
      });
      setFound({ levelId: level.id, lines });
      if (!lines.length) setNotice("No long coloured lines found on this sheet.");
    } finally {
      setFinding(false);
    }
  };
  const addFound = (hue: number, as: "beam" | "wall") => {
    if (!found || !level.plan?.scale) return;
    const frameNow = { scale: level.plan.scale, origin: level.plan.origin };
    let m = modelRef.current;
    const add: Member[] = [];
    // blue-filled walls on an engineer's plan are blockwork (15 series)
    const blue = hue === 7 || hue === 8;
    const lines = found.lines.filter((x) => x.hue === hue);
    let openings = 0;
    if (as === "beam")
      for (const l of lines) {
        const mem = newMember({ ...m, members: [...m.members, ...add] }, "beam", level.id, toWorld(frameNow, l.a), toWorld(frameNow, l.b));
        if (l.label) mem.label = l.label;
        add.push(mem);
      }
    else {
      // wall pieces in line become one wall; the breaks between them become windows and doors
      const prefix = level.elevation > 0.5 ? "LF" : "L";
      for (const run of joinWallRuns(lines.map((l) => ({ a: toWorld(frameNow, l.a), b: toWorld(frameNow, l.b) })))) {
        const work = { ...m, members: [...m.members, ...add] };
        const mem = newMember(work, "wall", level.id, run.a, run.b);
        if (mem.wall) {
          mem.wall = { ...mem.wall, ...(blue ? { kind: "block" as const, thickness: 140 } : {}), openings: [] };
          for (const o of run.openings) {
            const op: Opening = { id: newId().slice(0, 8), label: nextMark({ members: [...work.members, mem] }, prefix), offset: o.offset, width: o.width, sill: o.sill };
            mem.wall.openings.push(op);
            openings++;
          }
        }
        add.push(mem);
      }
    }
    m = { ...m, members: [...m.members, ...add] };
    commit(m, `Added ${add.length} ${as === "beam" ? "beams" : blue ? "block walls" : "walls"}${openings ? ` with ${openings} openings` : ""} found on the sheet`);
    setFound({ ...found, lines: found.lines.filter((x) => x.hue !== hue) });
  };
  const foundHere = found && found.levelId === level.id ? found.lines : [];

  const upload = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setNotice("Plans must be PDF files.");
    if (file.size > 50 * 1024 * 1024) return setNotice("That PDF is over 50 MB.");
    setUploading(file.name);
    setNotice("");
    try {
      const data = await file.arrayBuffer();
      const pages = await countPages(data);
      const path = `${job.id}/${newId()}.pdf`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("design-plans").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw new Error(error.message);
      const res = await registerPlan(job.id, path, file.name, pages);
      if (!res.ok) throw new Error(res.message);
      const doc = loadPdf(res.plan.id, data); // already in memory, no need to download it again
      setPlans((p) => [...p, res.plan]);
      setTab("levels");
      // Put each empty level on the sheet whose title names it.
      const open = modelRef.current.levels.filter((l) => !l.plan);
      const texts = open.length ? await doc.then(pageTexts).catch(() => []) : [];
      const picks = matchPlanPages(open, texts);
      if (!picks.size && !level.plan) {
        picks.set(level.id, 1);
        setNotice("Couldn't tell which page shows which level. Pick each level's page under Plan in the Levels tab.");
      }
      if (picks.size) {
        const m = modelRef.current;
        const set = m.levels.filter((l) => picks.has(l.id));
        commit(
          { ...m, levels: m.levels.map((l) => (picks.has(l.id) ? { ...l, plan: { planId: res.plan.id, page: picks.get(l.id)!, scale: null, origin: { x: 0, y: 0 } } } : l)) },
          `Plan pages set: ${set.map((l) => `${l.name} p${picks.get(l.id)}`).join(", ")}`,
        );
      }
    } catch (e) {
      setNotice(`Upload failed: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setUploading(null);
    }
  };

  // ------------------------------------------------------------ keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (ctrl && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if ((k === "delete" || k === "backspace") && !ctrl && selectedLintel) {
        e.preventDefault();
        removeOpening(selectedLintel.id);
        return;
      }
      if (ctrl && k === "d" && selected) {
        e.preventDefault();
        placeCopy(selected, { x: 0.3, y: 0.3 });
        return;
      }
      if (ctrl && k === "c" && selected) {
        clipboard.current = selected;
        return;
      }
      if (ctrl && k === "v" && clipboard.current) {
        e.preventDefault();
        const src = clipboard.current;
        // Paste at the cursor when it's over the plan, otherwise beside the original.
        const offset = cursor ? { x: cursor.x - src.a.x, y: cursor.y - src.a.y } : { x: 0.3, y: 0.3 };
        placeCopy(src, offset, level.id);
        return;
      }
      if (ctrl || e.altKey) return;
      if ((k === "delete" || k === "backspace") && multi.length > 1) {
        e.preventDefault();
        removeMany(multi);
        return;
      }
      if ((k === "delete" || k === "backspace") && selected) {
        e.preventDefault();
        removeMember(selected.id);
        return;
      }
      if (k === "escape") {
        setSelectedId(null);
        setMulti([]);
        return;
      }
      if (k === "v") setTool("select");
      else if (k === "h") setTool("pan");
      else if (k === "s") setTool("scale");
      else if (k === "o") setTool("origin");
      else if (k === "n") setTool("opening");
      else {
        const type = MEMBER_TYPES.find((ty) => MEMBER_INFO[ty].key === k);
        if (type) setTool(type);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedLintel, cursor, level.id, undo, redo, placeCopy, removeMember, removeOpening, multi, removeMany]);

  // ------------------------------------------------------------ export

  const downloadIfc = () => {
    const text = exportIfc(modelRef.current, runCalcs(modelRef.current), { title: job.title, jobNo: job.jobNo, address: job.address });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/x-step" }));
    a.download = `${(job.jobNo || job.title).replace(/[^\w.-]+/g, "-") || "structure"}.ifc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadReport = async () => {
    setReporting(true);
    try {
      const { buildReport } = await import("./report");
      const blob = await buildReport({
        job,
        company,
        model: modelRef.current,
        calcs: runCalcs(modelRef.current),
        revision: revisionRef.current,
        status: job.status,
        signoff,
        plans: plans.map((p) => ({ id: p.id, url: p.url })),
        compare: base ? { revision: base.revision, changes } : null,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(job.jobNo || job.title).replace(/[^\w.-]+/g, "-") || "structure"}-calcs-rev${revisionRef.current}${job.status === "signed" ? "" : "-DRAFT"}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      setNotice(`Couldn't build the report: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setReporting(false);
    }
  };

  // ------------------------------------------------------------ render

  const sortedLevels = [...model.levels].sort((a, b) => a.elevation - b.elevation);
  const below = sortedLevels[sortedLevels.findIndex((l) => l.id === level.id) - 1];
  // posts on the level above stand on this one's framing: show where, and what they bring down
  const upper = sortedLevels[sortedLevels.findIndex((l) => l.id === level.id) + 1];
  const postsAbove = upper
    ? model.members
        .filter((m) => m.levelId === upper.id && m.type === "post")
        .map((m) => {
          const r = calcs.results.get(m.id);
          const n = r?.kv.find((k) => k.label.startsWith("N*"));
          return { id: m.id, label: m.label, at: m.a, load: n && r?.status !== "none" ? `N* ${n.value}` : null, unstable: !!r?.unstable };
        })
    : [];
  const linesAbove = upper
    ? model.members
        .filter((m) => m.levelId === upper.id && m.b && (m.type === "bracing" || (m.type === "wall" && m.wall?.loadbearing !== false)))
        .map((m) => ({ id: m.id, label: m.type === "bracing" ? m.label : null, a: m.a, b: m.b! }))
    : [];
  const scaleOk = !level.plan || !!level.plan.scale;

  const saveLabel: Record<SaveState, string> = {
    saved: revision ? `Saved · rev ${revision}` : "Saved",
    dirty: "Unsaved changes",
    saving: "Saving…",
    conflict: "Changed elsewhere",
    error: "Not saved",
    locked: "Signed off · read only",
  };
  const saveTone = save === "saved" ? "text-white/70" : save === "conflict" || save === "error" ? "text-[#ffb4b4]" : save === "locked" ? "text-accent" : "text-white";

  const toolButton = (t: Tool, label: string, key: string, colour?: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTool(t)}
      disabled={locked && t !== "select" && t !== "pan"}
      title={`${label} (${key})`}
      aria-pressed={tool === t}
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold transition-colors disabled:opacity-40 ${tool === t ? "bg-ink text-white" : "text-ink hover:bg-surface-2"}`}
    >
      {colour ? <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colour }} /> : <span className="w-2.5 shrink-0" />}
      <span className="flex-1">{label}</span>
      <kbd className={`text-[10px] ${tool === t ? "text-white/60" : "text-muted"}`}>{key}</kbd>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      {/* top bar */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-ink px-3 py-2 text-white sm:px-4">
        <Link href="/portal/design" className="text-sm font-semibold text-white/75 hover:text-white">
          ← Design
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {job.jobNo ? <span className="mr-1.5 text-white/60 tabular-nums">{job.jobNo}</span> : null}
            {job.title}
          </p>
        </div>
        <span className={`text-xs font-semibold ${saveTone}`} role="status">
          {saveLabel[save]}
        </span>
        {save === "conflict" ? (
          <button type="button" className="rounded bg-white/15 px-2 py-0.5 text-xs font-semibold" onClick={() => window.location.reload()}>
            Reload latest
          </button>
        ) : null}
        {save === "error" ? (
          <button type="button" className="rounded bg-white/15 px-2 py-0.5 text-xs font-semibold" onClick={() => setSave("dirty")} title={saveMessage}>
            Retry
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
            {(["plan", "split", "3d", "sheets"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setMode(v)} className={`rounded-md px-2.5 py-1 ${mode === v ? "bg-white text-ink" : "text-white/80 hover:text-white"}`}>
                {v === "plan" ? "Plan" : v === "3d" ? "3D" : v === "split" ? "Plan + 3D" : "Sheets"}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
            {(["type", "material", "result"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setColourBy(v)} className={`rounded-md px-2.5 py-1 ${colourBy === v ? "bg-white text-ink" : "text-white/80 hover:text-white"}`}>
                {v === "type" ? "Type" : v === "material" ? "Material" : "Result"}
              </button>
            ))}
          </div>
          <button type="button" onClick={undo} disabled={!stacks.undo || locked} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold disabled:opacity-40" title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" onClick={redo} disabled={!stacks.redo || locked} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold disabled:opacity-40" title="Redo (Ctrl+Y)">
            Redo
          </button>
          <button type="button" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold lg:hidden">
            {panelOpen ? "Hide details" : selected ? `Details · ${selected.label}` : "Details"}
          </button>
          <button type="button" onClick={downloadIfc} disabled={!model.members.length} className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-ink disabled:opacity-40" title="Download the 3D model as IFC for Revit, ArchiCAD or AutoCAD">
            Download IFC
          </button>
        </div>
      </header>

      {toast ? (
        <button type="button" onClick={() => pick(toast.id, true)} role="alert" className="fixed bottom-6 left-1/2 z-50 max-w-xl -translate-x-1/2 rounded-lg border border-bad bg-bad-bg px-4 py-2 text-left text-sm font-semibold text-bad shadow-lg">
          {toast.text}
        </button>
      ) : null}
      {notice ? (
        <p className="flex items-center justify-between gap-3 bg-bad-bg px-4 py-1.5 text-sm font-semibold text-bad" role="alert">
          {notice}
          <button type="button" onClick={() => setNotice("")} className="text-xs underline">
            Dismiss
          </button>
        </p>
      ) : null}
      {save === "conflict" ? (
        <p className="bg-warn-bg px-4 py-1.5 text-sm text-warn">Someone else saved this job after you opened it. Reload to get their changes; anything you changed since your last save will be lost.</p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* tools */}
        <nav aria-label="Tools" className="hidden w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface p-2 md:flex">
          {toolButton("select", "Select", "V")}
          {toolButton("pan", "Pan", "H")}
          <p className="mt-2 px-2.5 text-[11px] font-bold tracking-wide text-muted uppercase">Members</p>
          {MEMBER_TYPES.map((t) => toolButton(t, MEMBER_INFO[t].label, MEMBER_INFO[t].key.toUpperCase(), MEMBER_INFO[t].colour))}
          {toolButton("opening", "Opening", "N", "#0891b2")}
          <p className="mt-2 px-2.5 text-[11px] font-bold tracking-wide text-muted uppercase">Plan</p>
          {toolButton("scale", "Scale", "S")}
          {toolButton("origin", "Origin", "O")}
          <div className="mt-auto px-2.5 pt-3 text-[11px] leading-relaxed text-muted tabular-nums">
            {cursor ? `x ${cursor.x.toFixed(3)} m · y ${cursor.y.toFixed(3)} m` : " "}
            <br />
            {level.plan ? (scaleOk ? "Scale set" : "Scale not set") : "Grid: 1 square = 1 m"}
          </div>
        </nav>

        {/* plan and 3D */}
        {mode === "sheets" ? (
          <div className="min-w-0 flex-1">
            <Sheets model={model} calcs={calcs} job={job} onPick={(id) => { pick(id, true); setMode("split"); }} />
          </div>
        ) : null}
        <div className={`min-w-0 flex-1 ${mode === "sheets" ? "hidden" : "flex"} ${mode === "split" ? "flex-col lg:flex-row" : ""}`}>
          {mode !== "3d" ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface px-2 py-1.5">
                {[...sortedLevels].reverse().map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setActiveLevelId(l.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${l.id === level.id ? "bg-accent-100 text-accent-600" : "text-muted hover:bg-surface-2"}`}
                  >
                    {l.name}
                    <span className="ml-1 font-normal tabular-nums">{model.members.filter((m) => m.levelId === l.id).length}</span>
                  </button>
                ))}
                {level.plan?.scale && page ? (
                  <button type="button" className="ml-2 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-accent-600 hover:bg-surface-2" onClick={findOnSheet} disabled={finding || locked} title="Find long coloured lines on this sheet and add them as beams">
                    {finding ? "Looking…" : "Find beams on the sheet"}
                  </button>
                ) : null}
                {/* mobile tool picker */}
                <select className="field ml-auto py-1 text-xs md:hidden" value={tool} onChange={(e) => setTool(e.target.value as Tool)} aria-label="Tool">
                  <option value="select">Select</option>
                  <option value="pan">Pan</option>
                  {MEMBER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MEMBER_INFO[t].label}
                    </option>
                  ))}
                  <option value="opening">Opening</option>
                  <option value="scale">Scale</option>
                  <option value="origin">Origin</option>
                </select>
              </div>
              {foundHere.length ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-100/60 px-3 py-1.5 text-xs">
                  <span className="font-semibold">Found on the sheet:</span>
                  {[...new Set(foundHere.map((l) => l.hue))].map((h) => {
                    const ls = foundHere.filter((l) => l.hue === h);
                    return (
                      <span key={h} className="flex items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5">
                        <i className="inline-block h-2 w-4" style={{ background: ls[0].colour }} />
                        <span className="text-muted">
                          {ls.length}
                          {ls.some((l) => l.label) ? ` (${ls.filter((l) => l.label).length} marked)` : ""}:
                        </span>
                        <button type="button" className="rounded px-1 font-semibold hover:bg-surface-2 hover:text-accent-600" onClick={() => addFound(h, "beam")} disabled={locked}>
                          beams
                        </button>
                        <button type="button" className="rounded px-1 font-semibold hover:bg-surface-2 hover:text-accent-600" onClick={() => addFound(h, "wall")} disabled={locked}>
                          walls
                        </button>
                      </span>
                    );
                  })}
                  <span className="text-muted">Each colour is a set of lines (dashed on the plan): add each set as beams or as walls.</span>
                  <button type="button" className="ml-auto font-semibold text-muted hover:text-ink" onClick={() => setFound(null)}>
                    Dismiss
                  </button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <PlanView
                  level={level}
                  members={model.members.filter((m) => m.levelId === level.id)}
                  grids={model.grids}
                  ghosts={below ? model.members.filter((m) => m.levelId === below.id) : []}
                  above={postsAbove}
                  aboveLines={linesAbove}
                  page={page}
                  pageLoading={pageLoading}
                  tool={locked && tool !== "pan" ? "select" : tool}
                  selectedId={selectedId}
                  calcs={calcs}
                  colourBy={colourBy}
                  focus={focus}
                  onSelect={(id) => pick(id)}
                  multi={multi}
                  suggest={foundHere}
                  clouds={cloudsOn(changes, level.id).map((c) => c.at)}
                  onToggle={(id) => {
                    const base = multi.length ? multi : selectedId && !selectedId.includes("#") ? [selectedId] : [];
                    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
                    setMulti(next);
                    setSelectedId(next.length === 1 ? next[0] : null);
                    setTab("member");
                  }}
                  onBox={(ids) => {
                    setMulti(ids);
                    setSelectedId(ids.length === 1 ? ids[0] : null);
                    setTab("member");
                  }}
                  onCreate={createMember}
                  onOpening={addOpening}
                  onMove={(id, a, b) => {
                    const mem = modelRef.current.members.find((x) => x.id === id);
                    if (mem) updateMember(id, { a, ...(b ? { b } : {}) }, `Moved ${mem.label}`);
                  }}
                  onScale={(p1, p2) => setScalePick({ p1, p2 })}
                  onOrigin={(p) => {
                    if (!level.plan) return setNotice("Pick a plan for this level first, on the Levels tab.");
                    replacePlacement(level, level.plan.scale, p, `${level.name} origin set`);
                    setTool("select");
                  }}
                  onCursor={setCursor}
                />
              </div>
            </div>
          ) : null}
          {mode === "3d" || mode === "split" ? (
            <div className={`relative min-h-0 min-w-0 flex-1 ${mode === "split" ? "border-t border-line lg:border-t-0 lg:border-l" : ""}`}>
              <View3D model={model} calcs={calcs} selectedId={selectedId} colourBy={colourBy} onSelect={(id) => pick(id, true)} />
              {colourBy === "material" ? (
                <div className="absolute bottom-2 left-2 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs shadow">
                  {(Object.keys(FAMILY_COLOUR) as (keyof typeof FAMILY_COLOUR)[]).map((f) => (
                    <span key={f} className="flex items-center gap-1.5">
                      <i className="inline-block h-2 w-3.5 border border-black/20" style={{ background: FAMILY_COLOUR[f] }} />
                      {FAMILY_LABEL[f]}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <i className="inline-block h-2 w-3.5 border border-black/20" style={{ background: "#b8342a" }} />
                    Fails
                  </span>
                </div>
              ) : null}
              {colourBy === "result" ? (
                <div className="absolute bottom-2 left-2 flex gap-3 rounded-lg bg-surface/90 px-2.5 py-1 text-xs shadow">
                  {(["pass", "close", "fail", "none"] as const).map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: { pass: "#16a34a", close: "#d97706", fail: "#dc2626", none: "#64748b" }[s] }} />
                      {{ pass: "Passes", close: "Close", fail: "Fails", none: "No check" }[s]}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* side panel */}
        <aside
          aria-label="Details"
          className={`${panelOpen ? "fixed inset-x-0 bottom-0 z-[55] flex h-[70dvh] rounded-t-xl border-t shadow-2xl" : "hidden"} shrink-0 flex-col border-line bg-surface lg:static lg:z-auto lg:flex lg:h-auto lg:w-[22rem] lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none`}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 lg:hidden">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">Details</span>
            <button type="button" onClick={() => setPanelOpen(false)} className="text-sm font-semibold text-muted hover:text-ink">
              Close
            </button>
          </div>
          <div className="flex overflow-x-auto border-b border-line text-[11px] font-semibold">
            {(
              [
                ["member", selected ? selected.label : selectedLintel ? selectedLintel.opening.label : "Overview"],
                ["schedule", "Schedule"],
                ["levels", "Levels"],
                ["loads", "Loads"],
                ["history", "History"],
                ["signoff", job.status === "signed" ? "Signed" : job.status === "in_review" ? "In review" : "Sign-off"],
              ] as const
            ).map(([t, label]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 border-b-2 px-1 py-2.5 whitespace-nowrap ${tab === t ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "member" ? (
              multi.length > 1 ? (
                <BulkPanel model={model} ids={multi} locked={locked} onPatch={(patch, summary) => patchMany(multi, patch, summary)} onDelete={() => removeMany(multi)} onClear={() => setMulti([])} />
              ) : selectedLintel ? (
                <OpeningPanel
                  lintel={selectedLintel}
                  result={results.get(selectedLintel.id)}
                  locked={locked}
                  onChange={(patch, summary) => updateOpening(selectedLintel.id, patch, summary)}
                  onDelete={() => removeOpening(selectedLintel.id)}
                  onSelectWall={() => setSelectedId(selectedLintel.wall.id)}
                />
              ) : selected ? (
                <MemberPanel
                  model={model}
                  member={selected}
                  result={results.get(selected.id)}
                  locked={locked}
                  onChange={(patch, summary) => updateMember(selected.id, patch, summary)}
                  onDuplicate={() => placeCopy(selected, { x: 0.3, y: 0.3 })}
                  onDelete={() => removeMember(selected.id)}
                  results={results}
                  onPick={(id) => pick(id, true)}
                  gaps={openGaps(model, gapsFor(model, calcs)).filter((g) => g.id === selected.id)}
                />
              ) : (
                <Overview
                  model={model}
                  calcs={calcs}
                  onPick={(id) => pick(id, true)}
                  locked={locked}
                  onLevel={(id) => {
                    setActiveLevelId(id);
                    if (mode === "3d") setMode("split");
                  }}
                  onAck={(key, ok, what) => {
                    const m = modelRef.current;
                    const ack = ok ? [...new Set([...(m.ack ?? []), key])] : (m.ack ?? []).filter((k) => k !== key);
                    commit({ ...m, ack }, ok ? `marked OK: ${what}` : `no longer OK: ${what}`);
                  }}
                />
              )
            ) : null}
            {tab === "schedule" ? <SchedulePanel model={model} calcs={calcs} selectedId={selectedId} onPick={(id) => pick(id, true)} /> : null}
            {tab === "loads" ? (
              <SitePanel
                model={model}
                locked={locked}
                address={job.address}
                onSite={(site, summary) => {
                  const m = modelRef.current;
                  commit({ ...m, site }, summary);
                }}
              />
            ) : null}
            {tab === "loads" ? (
              <ParamsPanel
                model={model}
                locked={locked}
                onParam={(k: keyof DesignParams, v: number) => {
                  const m = modelRef.current;
                  commit({ ...m, params: { ...m.params, [k]: v } }, `${k} ${v}`);
                }}
                onDemand={(levelId, k, v) => {
                  const m = modelRef.current;
                  const d = m.bracing[levelId] ?? { windAlong: 0, windAcross: 0, eq: 0 };
                  commit({ ...m, bracing: { ...m.bracing, [levelId]: { ...d, [k]: v } } }, `bracing demand ${k} ${v}`);
                }}
                onNotes={(notes) => {
                  const m = modelRef.current;
                  if (notes.join("\n") !== m.notes.join("\n")) commit({ ...m, notes }, "assumptions to confirm");
                }}
              />
            ) : null}
            {tab === "levels" ? <JobSection job={job} locked={locked} canDelete={canDelete} /> : null}
            {tab === "levels" ? (
              <GridPanel
                model={model}
                locked={locked}
                onGrids={(grids, summary) => {
                  const m = modelRef.current;
                  commit({ ...m, grids }, summary);
                }}
              />
            ) : null}
            {tab === "levels" ? (
              <LevelsPanel
                model={model}
                plans={plans}
                activeLevelId={level.id}
                locked={locked}
                uploading={uploading}
                onActivate={setActiveLevelId}
                onUpdateLevel={updateLevel}
                onAddLevel={addLevel}
                onDeleteLevel={deleteLevel}
                onUpload={upload}
                onSheetScale={(id, ratio) => {
                  const l = modelRef.current.levels.find((x) => x.id === id);
                  if (l?.plan) replacePlacement(l, (ratio * 25.4) / 72 / 1000, l.plan.origin, `${l.name} scale set to 1:${ratio}`);
                }}
              />
            ) : null}
            {tab === "signoff" ? (
              <PaperworkPanel
                model={model}
                job={job}
                company={company}
                locked={locked}
                onChange={(paperwork, summary) => {
                  const m = modelRef.current;
                  commit({ ...m, paperwork }, summary);
                }}
              />
            ) : null}
            {tab === "signoff" ? (
              <SignoffPanel
                jobId={job.id}
                status={job.status}
                signoff={signoff}
                revision={revision}
                saved={save === "saved" || save === "locked"}
                fails={[...results.values()].filter((r) => r.status === "fail").length}
                gaps={openGaps(model, gapsFor(model, calcs)).length}
                onReport={downloadReport}
                reporting={reporting}
              />
            ) : null}
            {tab === "history" && base ? (
              <ChangesPanel
                revision={base.revision}
                changes={changes}
                levelName={(id) => model.levels.find((l) => l.id === id)?.name ?? ""}
                onPick={(id) => {
                  const m = model.members.find((x) => x.id === id);
                  if (m && m.levelId !== level.id) setActiveLevelId(m.levelId);
                  pick(id, true);
                  setTab("history");
                }}
                onClear={() => setBase(null)}
              />
            ) : null}
            {tab === "history" ? <HistoryPanel jobId={job.id} revision={revision} locked={locked} onRestore={restore} comparing={base?.revision ?? null} onCompare={compareWith} /> : null}
          </div>
        </aside>
      </div>

      {scalePick ? (
        <ScaleDialog
          pdfDistance={Math.hypot(scalePick.p2.x - scalePick.p1.x, scalePick.p2.y - scalePick.p1.y)}
          onCancel={() => setScalePick(null)}
          onApply={(mm) => {
            const d = Math.hypot(scalePick.p2.x - scalePick.p1.x, scalePick.p2.y - scalePick.p1.y);
            setScalePick(null);
            setTool("select");
            if (!level.plan) return setNotice("Pick a plan for this level first, on the Levels tab.");
            replacePlacement(level, mm / 1000 / d, level.plan.origin, `${level.name} scale set (${mm} mm)`);
          }}
        />
      ) : null}
    </div>
  );
}

function ScaleDialog({ pdfDistance, onApply, onCancel }: { pdfDistance: number; onApply: (mm: number) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const mm = Number(value);
  const valid = Number.isFinite(mm) && mm > 0 && pdfDistance > 0.5;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="scale-title" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <form
        className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onApply(mm);
        }}
      >
        <h2 id="scale-title" className="text-lg font-semibold">
          Set the scale
        </h2>
        <p className="mt-1 text-sm text-muted">How long is the dimension you just picked, in real life?</p>
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="field-label">Real length (mm)</span>
          <input ref={ref} className="field tabular-nums" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 9600" />
        </label>
        {pdfDistance <= 0.5 ? <p className="mt-2 text-sm text-bad">Those two points are the same. Pick two different points.</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            Set scale
          </button>
        </div>
      </form>
    </div>
  );
}

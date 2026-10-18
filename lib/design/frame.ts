// A small 2D frame solver (direct stiffness, Euler–Bernoulli members) for the
// cases the closed-form beam checks can't do: continuous beams over posts,
// cantilevers, and portal frames. Units: kN, m (EI in kN·m², EA in kN).
//
// Each node has three freedoms (ux, uy, rz). Members can be pinned at either
// end (moment release). Loads: nodal forces, and on members a uniform load
// and point loads acting in global -Y (gravity) or along the member's local y.

export type FrameNode = { x: number; y: number; fix?: { x?: boolean; y?: boolean; r?: boolean } };
export type FrameLoad = { w?: number; points?: { at: number; P: number }[] }; // w kN/m and P kN, acting downwards (-Y); at = m from node i along the member
export type FrameMember = { i: number; j: number; EI: number; EA?: number; pinI?: boolean; pinJ?: boolean; load?: FrameLoad };
export type NodalLoad = { node: number; fx?: number; fy?: number; mz?: number };

export type MemberResult = {
  L: number;
  // end forces acting on the member, local axes: N along i→j, V along local +y, M anticlockwise
  end: { Ni: number; Vi: number; Mi: number; Nj: number; Vj: number; Mj: number };
  // sampled along the member: x (m from i), bending moment (kN·m, sagging +), shear (kN), transverse deflection (m, downward +)
  stations: { x: number; M: number; V: number; d: number }[];
};
export type FrameResult = { u: number[]; reactions: { node: number; fx: number; fy: number; mz: number }[]; members: MemberResult[] };

function solve(K: number[][], F: number[]): number[] {
  const n = F.length;
  const A = K.map((r, i) => [...r, F[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) throw new Error("unstable structure (a mechanism: add a support or fix a joint)");
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((r, i) => r[n] / r[i]);
}

// local stiffness of a beam-column element with optional end releases
function localK(EA: number, EI: number, L: number, pinI: boolean, pinJ: boolean): number[][] {
  const a = EA / L;
  const K = Array.from({ length: 6 }, () => Array(6).fill(0));
  K[0][0] = K[3][3] = a;
  K[0][3] = K[3][0] = -a;
  let k: number[][];
  if (!pinI && !pinJ) {
    const c1 = (12 * EI) / L ** 3,
      c2 = (6 * EI) / L ** 2,
      c3 = (4 * EI) / L,
      c4 = (2 * EI) / L;
    k = [
      [c1, c2, -c1, c2],
      [c2, c3, -c2, c4],
      [-c1, -c2, c1, -c2],
      [c2, c4, -c2, c3],
    ];
  } else if (pinI && !pinJ) {
    const c1 = (3 * EI) / L ** 3,
      c2 = (3 * EI) / L ** 2,
      c3 = (3 * EI) / L;
    k = [
      [c1, 0, -c1, c2],
      [0, 0, 0, 0],
      [-c1, 0, c1, -c2],
      [c2, 0, -c2, c3],
    ];
  } else if (!pinI && pinJ) {
    const c1 = (3 * EI) / L ** 3,
      c2 = (3 * EI) / L ** 2,
      c3 = (3 * EI) / L;
    k = [
      [c1, c2, -c1, 0],
      [c2, c3, -c2, 0],
      [-c1, -c2, c1, 0],
      [0, 0, 0, 0],
    ];
  } else k = Array.from({ length: 4 }, () => Array(4).fill(0));
  const map = [1, 2, 4, 5];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) K[map[r]][map[c]] = k[r][c];
  return K;
}

// fixed-end actions (local, transverse load q downward in local -y) for a fixed-fixed member,
// then adjusted for releases. Returns [N_i, V_i, M_i, N_j, V_j, M_j] as loads ON the member ends
function fixedEnd(L: number, qy: number, pts: { a: number; P: number }[], pinI: boolean, pinJ: boolean): number[] {
  // fixed-fixed: reactions for downward loads (acting -y): V up (+), M_i anticlockwise +, M_j clockwise (negative)
  let Vi = (qy * L) / 2,
    Vj = (qy * L) / 2,
    Mi = (qy * L * L) / 12,
    Mj = -(qy * L * L) / 12;
  for (const { a, P } of pts) {
    const b = L - a;
    Mi += (P * a * b * b) / (L * L);
    Mj -= (P * a * a * b) / (L * L);
    Vi += (P * b * b * (3 * a + b)) / L ** 3;
    Vj += (P * a * a * (a + 3 * b)) / L ** 3;
  }
  // releases: redistribute released moment to the other end (propped / simple)
  if (pinI && pinJ) {
    // simply supported
    let ViS = (qy * L) / 2,
      VjS = (qy * L) / 2;
    for (const { a, P } of pts) {
      ViS += (P * (L - a)) / L;
      VjS += (P * a) / L;
    }
    return [0, ViS, 0, 0, VjS, 0];
  }
  if (pinI) {
    // release Mi: carry over half to j
    Mj -= Mi / 2;
    Vi -= (1.5 * Mi) / L;
    Vj += (1.5 * Mi) / L;
    Mi = 0;
  } else if (pinJ) {
    Mi -= Mj / 2;
    Vi -= (1.5 * Mj) / L;
    Vj += (1.5 * Mj) / L;
    Mj = 0;
  }
  return [0, Vi, Mi, 0, Vj, Mj];
}

export function solveFrame(nodes: FrameNode[], members: FrameMember[], nodal: NodalLoad[] = [], stationsPer = 20, exactPeaks = true): FrameResult {
  const nd = nodes.length * 3;
  const K = Array.from({ length: nd }, () => Array(nd).fill(0));
  const F = Array(nd).fill(0);
  const geo = members.map((m) => {
    const a = nodes[m.i],
      b = nodes[m.j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const c = (b.x - a.x) / L,
      s = (b.y - a.y) / L;
    return { L, c, s };
  });
  const T = (c: number, s: number) => {
    const t = Array.from({ length: 6 }, () => Array(6).fill(0));
    for (const o of [0, 3]) {
      t[o][o] = c;
      t[o][o + 1] = s;
      t[o + 1][o] = -s;
      t[o + 1][o + 1] = c;
      t[o + 2][o + 2] = 1;
    }
    return t;
  };
  const fefs: number[][] = [];
  members.forEach((m, e) => {
    const { L, c, s } = geo[e];
    const EA = m.EA ?? m.EI * 1e4;
    const kl = localK(EA, m.EI, L, !!m.pinI, !!m.pinJ);
    const t = T(c, s);
    // k_global = T^T k T
    const kg = Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: 6 }, (_, q) => {
        let v = 0;
        for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) v += t[x][r] * kl[x][y] * t[y][q];
        return v;
      }),
    );
    const dof = [m.i * 3, m.i * 3 + 1, m.i * 3 + 2, m.j * 3, m.j * 3 + 1, m.j * 3 + 2];
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) K[dof[r]][dof[q]] += kg[r][q];
    // gravity loads -> local components: transverse q_y = w·c (per unit length along member), axial part neglected for flat beams
    const w = m.load?.w ?? 0;
    const qt = w * c; // transverse share of a vertical load
    const pts = (m.load?.points ?? []).map((p) => ({ a: p.at, P: p.P * c }));
    const fe = fixedEnd(L, qt, pts, !!m.pinI, !!m.pinJ);
    fefs.push(fe);
    // equivalent nodal loads = -(fixed-end reactions), in global
    for (let r = 0; r < 6; r++) {
      let g = 0;
      for (let x = 0; x < 6; x++) g += t[x][r] * fe[x];
      F[dof[r]] -= g;
    }
  });
  for (const l of nodal) {
    F[l.node * 3] += l.fx ?? 0;
    F[l.node * 3 + 1] += l.fy ?? 0;
    F[l.node * 3 + 2] += l.mz ?? 0;
  }
  // freedoms: drop fixed ones and released rotations that no element stiffens
  const fixed = new Set<number>();
  nodes.forEach((n, i) => {
    if (n.fix?.x) fixed.add(i * 3);
    if (n.fix?.y) fixed.add(i * 3 + 1);
    if (n.fix?.r) fixed.add(i * 3 + 2);
  });
  for (let d = 0; d < nd; d++) if (!fixed.has(d) && Math.abs(K[d][d]) < 1e-12) fixed.add(d); // e.g. rotation at a node where every member is pinned
  const free = [...Array(nd).keys()].filter((d) => !fixed.has(d));
  const Kf = free.map((r) => free.map((c) => K[r][c]));
  const uf = solve(Kf, free.map((d) => F[d]));
  const u = Array(nd).fill(0);
  free.forEach((d, k) => (u[d] = uf[k]));

  // reactions
  const R = Array(nd).fill(0);
  for (let r = 0; r < nd; r++) {
    let v = 0;
    for (let c = 0; c < nd; c++) v += K[r][c] * u[c];
    R[r] = v - F[r];
  }
  const reactions = nodes
    .map((n, i) => ({ node: i, fx: R[i * 3], fy: R[i * 3 + 1], mz: R[i * 3 + 2], fixed: !!(n.fix?.x || n.fix?.y || n.fix?.r) }))
    .filter((r) => r.fixed)
    .map(({ node, fx, fy, mz }) => ({ node, fx, fy, mz }));

  const results: MemberResult[] = members.map((m, e) => {
    const { L, c, s } = geo[e];
    const EA = m.EA ?? m.EI * 1e4;
    const kl = localK(EA, m.EI, L, !!m.pinI, !!m.pinJ);
    const t = T(c, s);
    const dof = [m.i * 3, m.i * 3 + 1, m.i * 3 + 2, m.j * 3, m.j * 3 + 1, m.j * 3 + 2];
    const ug = dof.map((d) => u[d]);
    const ul = t.map((row) => row.reduce((acc, v, k) => acc + v * ug[k], 0));
    const f = kl.map((row, r) => row.reduce((acc, v, k) => acc + v * ul[k], 0) + fefs[e][r]);
    const end = { Ni: f[0], Vi: f[1], Mi: f[2], Nj: f[3], Vj: f[4], Mj: f[5] };
    const w = (m.load?.w ?? 0) * c;
    const pts = (m.load?.points ?? []).map((p) => ({ a: p.at, P: p.P * c }));
    // rotation at i (unknown if pinned: then fitted to the displacement at j)
    const thI = m.pinI ? null : ul[2];
    const v1 = ul[1],
      v2 = ul[4];
    const stations: MemberResult["stations"] = [];
    const xs = new Set<number>();
    for (let k = 0; k <= stationsPer; k++) xs.add((L * k) / stationsPer);
    pts.forEach((p) => xs.add(Math.min(L, Math.max(0, p.a))));
    // the peak moment sits where shear crosses zero: add those points exactly
    if (w > 0 && exactPeaks) {
      const cuts = [0, ...pts.map((p) => p.a).sort((a, b) => a - b), L];
      for (let k = 0; k < cuts.length - 1; k++) {
        // within this stretch V(x) = Vi - ΣP(before) - w·x
        const xz = (end.Vi - pts.filter((p) => p.a <= cuts[k] + 1e-9).reduce((a, p) => a + p.P, 0)) / w;
        if (xz > cuts[k] && xz < cuts[k + 1]) xs.add(xz);
      }
    }
    // integrate curvature numerically for the transverse deflection: M(x)/EI, with the
    // chord displacements and the end rotation (or, if pinned, the shape that matches the other end)
    const xsSorted = [...xs].sort((a, b) => a - b);
    const Mx = (x: number) => {
      // sagging +: M = -Mi + Vi·x - w x²/2 - Σ P (x - a)
      let M = -end.Mi + end.Vi * x - (w * x * x) / 2;
      for (const p of pts) if (x > p.a) M -= p.P * (x - p.a);
      return M;
    };
    const Vx = (x: number) => {
      let V = end.Vi - w * x;
      for (const p of pts) if (x > p.a) V -= p.P;
      return V;
    };
    // double integration of κ = M/EI from i with unknown initial slope fitted to v(L) = v2
    const N = 400;
    const h = L / N;
    const integ = (slope0: number) => {
      const vs = [0];
      let th = slope0,
        v = 0;
      for (let k = 0; k < N; k++) {
        const x0 = k * h;
        const k0 = Mx(x0) / m.EI,
          k1 = Mx(x0 + h) / m.EI;
        // local y up; sagging moment gives positive curvature (v'' = M/EI with M sagging +, v up)
        v += th * h + (h * h * (2 * k0 + k1)) / 6;
        th += (h * (k0 + k1)) / 2;
        vs.push(v);
      }
      return vs;
    };
    const base = integ(0);
    const slope0 = thI !== null ? thI : (v2 - v1 - base[N]) / L;
    const vs = integ(slope0).map((v) => v1 + v);
    for (const x of xsSorted) {
      const k = Math.min(N, Math.round(x / h));
      stations.push({ x, M: Mx(x), V: Vx(x), d: -vs[k] });
    }
    return { L, end, stations };
  });
  return { u, reactions, members: results };
}

// Continuous beam along a line: supports at given positions (m from the left
// end; the beam may overhang them), uniform load w (kN/m) on given segments,
// point loads. Returns moments, shears, deflections and support reactions.
export type BeamSpan = { length: number; supports: number[]; EI: number };
// extraCuts and exactPeaks = false give every call the same stations, so
// results of separate load cases can be added together.
export function solveBeam(b: BeamSpan, w: (x0: number, x1: number) => number, points: { at: number; P: number }[], stationsPer = 120, extraCuts: number[] = [], exactPeaks = true) {
  const cuts = [...new Set([0, b.length, ...b.supports, ...points.map((p) => p.at), ...extraCuts].map((v) => Math.round(v * 1e6) / 1e6))]
    .filter((v) => v >= 0 && v <= b.length + 1e-9)
    .sort((a, c) => a - c);
  const sup = new Set(b.supports.map((v) => Math.round(v * 1e6) / 1e6));
  const first = Math.min(...sup);
  const nodes: FrameNode[] = cuts.map((x) => ({ x, y: 0, fix: sup.has(x) ? { y: true, x: x === first } : undefined }));
  const members: FrameMember[] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const x0 = cuts[k],
      x1 = cuts[k + 1];
    members.push({ i: k, j: k + 1, EI: b.EI, EA: b.EI * 1e4, load: { w: w(x0, x1) } });
  }
  const nodal: NodalLoad[] = points.map((p) => ({ node: cuts.findIndex((c) => Math.abs(c - p.at) < 1e-6), fy: -p.P })).filter((l) => l.node >= 0);
  const r = solveFrame(nodes, members, nodal, Math.max(16, Math.round(stationsPer / members.length)), exactPeaks);
  const stations = r.members.flatMap((mr, k) => mr.stations.map((s) => ({ x: cuts[k] + s.x, M: s.M, V: s.V, d: s.d })));
  const reactions = r.reactions.map((q) => ({ at: cuts[q.node], R: q.fy }));
  return { stations, reactions };
}

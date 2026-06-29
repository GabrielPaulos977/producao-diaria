import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area, ComposedChart, Line, PieChart, Pie, ReferenceLine, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { db, ref, set, onValue, push, remove } from "./firebase";
import { BASES, EQUIPES_POR_BASE, INIT_NOTAS, DIAS_UTEIS, DIVISOR_US, MOTIVOS_RETRAB, SERVICOS_LISTA } from "./data";
import * as XLSX from "xlsx";

const today = new Date().toISOString().split("T")[0];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const BRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fUS = v => (v || 0).toFixed(2);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const pctCol = p => (p >= 100 ? "#34d399" : p >= 70 ? "#a3e635" : p >= 40 ? "#facc15" : p > 0 ? "#fb923c" : "#475569");
const tipoCor = t => (t === "B3" ? "#3b9eff" : t === "C1" ? "#a78bfa" : t === "B1" ? "#fbbf24" : "#475569");
const eqLabel = eq => eq.nome + " - " + eq.enc;
const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const nextMonth = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const monthLabel = (m) => { const [y, mo] = m.split("-").map(Number); return MESES[mo] + " " + y; };

function Ring({ value, max, size = 80, stroke = 7 }) {
  const p = pct(value, max), r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const o = c - (c * Math.min(p, 100)) / 100, col = pctCol(p);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={o} strokeLinecap="round" style={{ transition: "stroke-dashoffset .5s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="m" style={{ fontSize: size * .22, fontWeight: 800, color: col }}>{p}%</span>
      </div>
    </div>
  );
}

// ═══ Firebase helpers ═══
function fbSet(path, data) { return set(ref(db, path), data); }
function fbPush(path, data) { return push(ref(db, path), data); }
function fbRemove(path) { return remove(ref(db, path)); }

function useFBData(path, fallback) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!path) { setData(fallback); setLoading(false); return; }
    setLoading(true);
    const unsub = onValue(ref(db, path), snap => {
      setData(snap.exists() ? snap.val() : fallback);
      setLoading(false);
    });
    return () => unsub();
  }, [path]);
  return [data, loading];
}

export default function App() {
  const [role, setRole] = useState(null); // null | "auxiliar" | "gestor" | "coordenador" | "programador"
  const [baseSel, setBaseSel] = useState(null); // base id

  // Dynamic Firebase paths based on selected base
  const bp = baseSel && baseSel !== "all" ? `bases/${baseSel}` : null;
  const [notasRaw, notasLoading] = useFBData(bp ? `${bp}/notas` : null, null);
  const [atribsRaw] = useFBData(bp ? `${bp}/atribs` : null, {});
  const [retrabRaw] = useFBData(bp ? `${bp}/retrab` : null, {});
  const [cavasRaw] = useFBData(bp ? `${bp}/cavas` : null, {});
  const [prepsRaw] = useFBData(bp ? `${bp}/preps` : null, {});
  const [inspecoesRaw] = useFBData(bp ? `${bp}/inspecoes` : null, {});
  const [notaStatusRaw] = useFBData(bp ? `${bp}/notaStatus` : null, {});
  const [alertasRaw] = useFBData(bp ? `${bp}/alertas` : null, {});

  // Coordenador: load all bases data
  const [allBasesRaw] = useFBData(role === "coordenador" || role === "programador" ? "bases" : null, {});

  // Dynamic EQUIPES based on selected base
  const EQUIPES = useMemo(() => baseSel ? (EQUIPES_POR_BASE[baseSel] || []) : [], [baseSel]);
  const baseNome = BASES.find(b => b.id === baseSel)?.nome || "";

  // Convert firebase object to array  
  const fbToArr = (obj) => { if (!obj) return []; if (Array.isArray(obj)) return obj; return Object.entries(obj).map(([k, v]) => ({ ...v, _fbKey: k })); };

  const [dataSel, setDataSel] = useState(today);
  const [screen, setScreen] = useState("home");
  const [atribForm, setAtribForm] = useState(null);
  const [selEq, setSelEq] = useState(null);
  const [histEq, setHistEq] = useState("all");
  const [histMonth, setHistMonth] = useState(today.slice(0, 7));
  const [retForm, setRetForm] = useState(null);
  const [addExtraFor, setAddExtraFor] = useState(null);
  const [extraForm, setExtraForm] = useState(null);
  const [cavaModal, setCavaModal] = useState(null);
  const [cavaData, setCavaData] = useState(today);
  const [importMsg, setImportMsg] = useState("");
  const [notaBusca, setNotaBusca] = useState("");
  const [retNotaBusca, setRetNotaBusca] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [gestorSenha, setGestorSenha] = useState("");
  const [gestorErro, setGestorErro] = useState(false);
  const [showSenha, setShowSenha] = useState(false);
  const [inspecaoForm, setInspecaoForm] = useState(null);
  const [prepNotaBusca, setPrepNotaBusca] = useState("");

  const GESTOR_SENHA = "admin2026";
  const [prepForm, setPrepForm] = useState(null);

  // Migration: copy old root data to bases/santa-rosa (runs once)
  useEffect(() => {
    const checkMigration = async () => {
      try {
        const { get } = await import("firebase/database");
        const migFlag = await get(ref(db, "migrated_v1"));
        if (migFlag.exists()) return; // Already migrated
        
        const oldNotas = await get(ref(db, "notas"));
        if (!oldNotas.exists()) return; // No old data
        
        // Copy all root data to bases/santa-rosa
        const paths = ["notas", "atribs", "retrab", "cavas", "preps", "inspecoes", "notaStatus"];
        for (const p of paths) {
          const snap = await get(ref(db, p));
          if (snap.exists()) {
            await set(ref(db, "bases/santa-rosa/" + p), snap.val());
          }
        }
        // Mark as migrated
        await set(ref(db, "migrated_v1"), true);
        console.log("✅ Migração concluída: dados copiados para bases/santa-rosa");
      } catch (e) { console.error("Erro na migração:", e); }
    };
    checkMigration();
  }, []);

  // Init notas if empty - removed auto-load, user imports manually
  useEffect(() => {
    // Database starts empty, user imports via Excel
  }, [notasLoading, notasRaw]);

  const notas = useMemo(() => fbToArr(notasRaw) || [], [notasRaw]);
  const atribs = useMemo(() => fbToArr(atribsRaw), [atribsRaw]);
  const retrab = useMemo(() => fbToArr(retrabRaw), [retrabRaw]);
  const cavas = useMemo(() => fbToArr(cavasRaw), [cavasRaw]);
  const preps = useMemo(() => fbToArr(prepsRaw), [prepsRaw]);
  const inspecoes = useMemo(() => fbToArr(inspecoesRaw), [inspecoesRaw]);
  const notaStatus = useMemo(() => notaStatusRaw || {}, [notaStatusRaw]);
  const alertas = useMemo(() => {
    const raw = alertasRaw || {};
    if (Array.isArray(raw)) return raw.filter(a => a).map((a, i) => ({ ...a, _fbKey: String(i) }));
    return Object.entries(raw).map(([k, v]) => ({ ...v, _fbKey: k }));
  }, [alertasRaw]);
  const alertasNaoLidos = alertas.filter(a => !a.lido);

  const doDia = atribs.filter(a => a.data === dataSel);
  const eqMap = useMemo(() => { const m = {}; doDia.forEach(a => { if (!m[a.eqId]) m[a.eqId] = []; m[a.eqId].push(a); }); return m; }, [doDia]);

  const getPts = useCallback((nId, pIds) => { const n = notas.find(x => x.id === nId); return n ? (n.pontos || []).filter(p => pIds.includes(p.id)) : []; }, [notas]);

  const getAtribReal = useCallback((a) => {
    const pts = getPts(a.notaId, a.pIds); const st = a.status || {};
    const svcSt = a.svcStatus || {};
    let cR = 0, cU = 0;
    pts.forEach(p => {
      if (st[p.id] !== "ok") return;
      // If svcStatus exists for this ponto, calculate from individual services
      if (svcSt[p.id] && p.svcs && p.svcs.length > 0) {
        p.svcs.forEach(s => {
          if (svcSt[p.id][s.id] !== false) { // default true (done), false = not done
            cR += s.r; cU += s.u;
          }
        });
      } else {
        // Fallback: full point value
        cR += p.r; cU += p.u;
      }
    });
    const eR = (a.extras || []).reduce((s, e) => s + (Number(e.valor) || 0), 0);
    const cavaCount = cavas.filter(c => c.atribId === (a._fbKey || a.id)).length;
    const cavaUS = cavaCount * 2;
    return { realR: cR + eR - cavaUS * DIVISOR_US, realUS: cU + eR / DIVISOR_US - cavaUS };
  }, [getPts, cavas]);

  const getCavaUS = useCallback((eqId, filterFn) => cavas.filter(c => c.prepEqId === eqId && filterFn(c)).length * 2, [cavas]);

  const getTotals = useCallback((ea) => {
    let pR = 0, pU = 0, rR = 0, rU = 0, nP = 0;
    ea.forEach(a => { const pts = getPts(a.notaId, a.pIds); pR += pts.reduce((s, p) => s + p.r, 0); pU += pts.reduce((s, p) => s + p.u, 0); const ar = getAtribReal(a); rR += ar.realR; rU += ar.realUS; nP += pts.length; });
    if (ea.length > 0) {
      const eqId = ea[0].eqId;
      const cUS = getCavaUS(eqId, c => ea.some(a => a.data === c.data)); rU += cUS; rR += cUS * DIVISOR_US;
      const dayPreps = preps.filter(p => p.eqId === eqId && ea.some(a => a.data === p.data));
      const prepUS = dayPreps.reduce((s, p) => s + (Number(p.us) || 0), 0);
      rU += prepUS; rR += prepUS * DIVISOR_US;
    }
    return { prevR: pR, prevUS: pU, realR: rR, realUS: rU, nPts: nP };
  }, [getPts, getAtribReal, getCavaUS, preps]);

  const totPrev = Object.values(eqMap).reduce((s, ea) => s + getTotals(ea).prevR, 0);
  const totReal = Object.values(eqMap).reduce((s, ea) => s + getTotals(ea).realR, 0);
  const totPrevUS = Object.values(eqMap).reduce((s, ea) => s + getTotals(ea).prevUS, 0);
  const totRealUS = Object.values(eqMap).reduce((s, ea) => s + getTotals(ea).realUS, 0);

  // Toggle ponto status
  const togglePonto = (aKey, pId) => {
    const atrib = atribs.find(a => (a._fbKey || a.id) === aKey);
    if (!atrib) return;
    const st = { ...(atrib.status || {}) };
    const cur = st[pId] || "pending";
    const next = cur === "pending" ? "ok" : cur === "ok" ? "no" : "pending";

    if (next === "ok") {
      const pts = getPts(atrib.notaId, atrib.pIds);
      const pt = pts.find(p => p.id === pId);
      if (pt && pt.n.toUpperCase().startsWith("P")) {
        st[pId] = next;
        fbSet(`atribs/${aKey}/status`, st);
        setCavaData(atrib.data);
        setCavaModal({ atribKey: aKey, pontoId: pId, pontoNome: pt.n, data: atrib.data });
        return;
      }
    }
    if (cur === "ok") {
      // Remove cavas for this ponto
      cavas.filter(c => c.atribId === aKey && c.pontoId === pId).forEach(c => fbRemove(`cavas/${c._fbKey}`));
    }
    st[pId] = next;
    fbSet(`atribs/${aKey}/status`, st);
  };

  const salvarCava = (prepEqId) => {
    if (!cavaModal) return;
    fbPush(bp+"/cavas", { atribId: cavaModal.atribKey, pontoId: cavaModal.pontoId, prepEqId, data: cavaData });
    setCavaModal(null);
  };

  const addExtra = (aKey, desc, valor) => {
    const atrib = atribs.find(a => (a._fbKey || a.id) === aKey);
    if (!atrib) return;
    const extras = [...(atrib.extras || []), { id: uid(), desc, valor: Number(valor) || 0 }];
    fbSet(`atribs/${aKey}/extras`, extras);
  };

  const delExtra = (aKey, extraId) => {
    const atrib = atribs.find(a => (a._fbKey || a.id) === aKey);
    if (!atrib) return;
    const extras = (atrib.extras || []).filter(e => e.id !== extraId);
    fbSet(`atribs/${aKey}/extras`, extras);
  };

  const pontosUsados = new Set(); doDia.forEach(a => (a.pIds || []).forEach(pid => { const st = (a.status || {})[pid]; if (st !== "no") pontosUsados.add(a.notaId + ":" + pid); }));

  const salvarAtrib = () => {
    if (!atribForm?.eqId || !atribForm?.notaId || !atribForm.pIds?.length) return;
    fbPush(bp+"/atribs", { id: uid(), eqId: atribForm.eqId, notaId: atribForm.notaId, pIds: atribForm.pIds, data: dataSel, status: {}, extras: [] });
    setAtribForm(null); setScreen("home");
  };

  const delAtrib = (aKey) => { fbRemove(`atribs/${aKey}`); };

  const handleImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const dataRows = rows.slice(1).filter(r => r[0] && r[1]);
      const map = {};
      
      // Auto-detect R$ column: find which column has the header containing "R$" or "Total"
      const header = rows[0] || [];
      let rColIdx = -1;
      for (let i = 0; i < header.length; i++) {
        const h = String(header[i] || "").toLowerCase();
        if (h.includes("r$") || h.includes("total")) { rColIdx = i; break; }
      }
      // Fallback: find the column with largest average numeric values (likely R$)
      if (rColIdx < 0) {
        const colSums = {};
        dataRows.slice(0, 20).forEach(r => {
          for (let i = 3; i < r.length; i++) {
            if (typeof r[i] === "number" || (typeof r[i] === "string" && !isNaN(parseFloat(r[i])))) {
              const v = parseFloat(r[i]) || 0;
              if (v > 1) { colSums[i] = (colSums[i] || 0) + v; }
            }
          }
        });
        // The column with highest sum is likely R$ Total
        let maxSum = 0;
        Object.entries(colSums).forEach(([idx, sum]) => {
          if (sum > maxSum) { maxSum = sum; rColIdx = parseInt(idx); }
        });
      }
      if (rColIdx < 0) rColIdx = 5; // default fallback
      
      dataRows.forEach(r => {
        const nota = String(r[0]).trim(), ponto = String(r[1]).trim();
        const desc = String(r[2] || "").trim();
        const valor = parseFloat(r[rColIdx]) || 0;
        const us = valor / DIVISOR_US;
        if (!map[nota]) map[nota] = {};
        if (!map[nota][ponto]) map[nota][ponto] = { svcs: [], r: 0, u: 0 };
        map[nota][ponto].svcs.push({ id: uid(), d: desc, r: Math.round(valor * 100) / 100, u: Math.round(us * 10000) / 10000 });
        map[nota][ponto].r += valor; map[nota][ponto].u += us;
      });
      const existIds = new Set(notas.map(n => n.nome));
      const newN = [];
      Object.entries(map).forEach(([nome, pontos]) => {
        if (existIds.has(nome)) return;
        const pts = Object.entries(pontos).map(([pn, pd]) => ({
          id: uid(), n: pn, sc: pd.svcs.length, svcs: pd.svcs, r: Math.round(pd.r * 100) / 100, u: Math.round(pd.u * 10000) / 10000
        }));
        newN.push({ id: uid(), nome, pontos: pts, r: Math.round(pts.reduce((s, p) => s + p.r, 0) * 100) / 100, u: Math.round(pts.reduce((s, p) => s + p.u, 0) * 10000) / 10000 });
      });
      if (newN.length === 0) { setImportMsg("Nenhuma nota nova."); }
      else {
        const updated = [...notas, ...newN];
        fbSet(bp+"/notas", updated);
        setImportMsg(newN.length + " nota(s) importada(s)!");
      }
    } catch (err) { setImportMsg("Erro: " + err.message); }
    setTimeout(() => setImportMsg(""), 4000); e.target.value = "";
  };

  // History + Ranking
  const getEqMonthUS = useCallback((eqId, month) => {
    const mA = atribs.filter(a => a.data?.startsWith(month) && a.eqId === eqId);
    let rU = 0; mA.forEach(a => { rU += getAtribReal(a).realUS; });
    rU += getCavaUS(eqId, c => c.data?.startsWith(month));
    // Add preps
    const eqPreps = preps.filter(p => p.eqId === eqId && p.data?.startsWith(month));
    rU += eqPreps.reduce((s, p) => s + (Number(p.us) || 0), 0);
    return Math.round(rU * 100) / 100;
  }, [atribs, getAtribReal, getCavaUS, preps]);

  const getEqDayUS = useCallback((eqId, dateStr) => {
    const dA = atribs.filter(a => a.data === dateStr && a.eqId === eqId);
    let rU = 0; dA.forEach(a => { rU += getAtribReal(a).realUS; });
    rU += getCavaUS(eqId, c => c.data === dateStr);
    // Add preps
    const eqPreps = preps.filter(p => p.eqId === eqId && p.data === dateStr);
    rU += eqPreps.reduce((s, p) => s + (Number(p.us) || 0), 0);
    return Math.round(rU * 100) / 100;
  }, [atribs, getAtribReal, getCavaUS, preps]);

  const histData = useMemo(() => {
    const [y, m] = histMonth.split("-").map(Number); const dM = new Date(y, m, 0).getDate(); const days = [];
    for (let d = 1; d <= dM; d++) {
      const ds = histMonth + "-" + String(d).padStart(2, "0");
      const mA = atribs.filter(a => a.data === ds && (histEq === "all" || a.eqId === histEq));
      let rU = 0, pU = 0;
      mA.forEach(a => { const pts = getPts(a.notaId, a.pIds); pU += pts.reduce((s, p) => s + p.u, 0); rU += getAtribReal(a).realUS; });
      days.push({ dia: d, realUS: Math.round(rU * 100) / 100, prevUS: Math.round(pU * 100) / 100 });
    }
    return days;
  }, [histMonth, histEq, atribs, getPts, getAtribReal]);

  const ranking = useMemo(() => {
    return EQUIPES.map(eq => {
      const mUS = getEqMonthUS(eq.id, histMonth); const metaMes = eq.meta * DIAS_UTEIS;
      const dUS = getEqDayUS(eq.id, dataSel);
      return { ...eq, mesUS: Math.round(mUS * 100) / 100, metaMes, diaUS: Math.round(dUS * 100) / 100, pctMes: pct(mUS, metaMes), pctDia: pct(dUS, eq.meta) };
    }).sort((a, b) => b.mesUS - a.mesUS);
  }, [histMonth, dataSel, getEqMonthUS, getEqDayUS]);

  const notaSel = atribForm ? notas.find(n => n.id === atribForm.notaId) : null;
  const ptsDispo = notaSel ? (notaSel.pontos || []).filter(p => !pontosUsados.has(notaSel.id + ":" + p.id)) : [];
  const sI = s => s === "ok" ? "✅" : s === "no" ? "❌" : "⏳";

  // Monthly totals for speedometer
  const mesAtribs = atribs.filter(a => a.data?.startsWith(histMonth));
  const mesTotalRealUS = useMemo(() => {
    let t = 0;
    EQUIPES.forEach(eq => { t += getEqMonthUS(eq.id, histMonth); });
    return Math.round(t * 100) / 100;
  }, [histMonth, getEqMonthUS]);
  
  // Conclusão = only US from notas with status "Concluída"
  const mesTotalConclusaoUS = useMemo(() => {
    let t = 0;
    // Get notas that are marked as "concluida" in notaStatus
    const notasConcluidas = new Set();
    Object.entries(notaStatus).forEach(([notaId, st]) => {
      if (st === "concluida") notasConcluidas.add(notaId);
    });
    
    mesAtribs.forEach(a => {
      // Only count if the nota has status "concluida"
      if (!notasConcluidas.has(a.notaId)) return;
      
      const pts = getPts(a.notaId, a.pIds);
      const st = a.status || {};
      const svcSt = a.svcStatus || {};
      pts.forEach(p => {
        if (st[p.id] !== "ok") return;
        if (svcSt[p.id] && p.svcs && p.svcs.length > 0) {
          p.svcs.forEach(s => { if (svcSt[p.id][s.id] !== false) t += s.u; });
        } else {
          t += p.u;
        }
      });
    });
    return Math.round(t * 100) / 100;
  }, [mesAtribs, getPts, notaStatus]);
  
  const mesMetaTotal = EQUIPES.reduce((s, eq) => s + eq.meta * DIAS_UTEIS, 0);
  const mesDiasComDados = new Set(mesAtribs.map(a => a.data)).size;

  // Gauge component
  const Gauge = ({ value, max, label, sublabel }) => {
    const p = pct(value, max);
    const angle = Math.min(p, 100) * 1.8; // 0-180 degrees
    const col = pctCol(p);
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ position: "relative", width: 160, height: 90, margin: "0 auto" }}>
          <svg width="160" height="90" viewBox="0 0 160 90">
            <path d="M 15 85 A 65 65 0 0 1 145 85" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="12" strokeLinecap="round" />
            <path d="M 15 85 A 65 65 0 0 1 145 85" fill="none" stroke={col} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${angle / 180 * 204} 204`} style={{ transition: "stroke-dasharray .8s ease" }} />
          </svg>
          <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center" }}>
            <div className="m" style={{ fontSize: 26, fontWeight: 900, color: col }}>{p}%</div>
          </div>
        </div>
        <div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginTop: 4 }}>{fUS(value)} US</div>
        <div style={{ fontSize: 10, color: "#4b6080" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 9, color: "#3a5070" }}>{sublabel}</div>}
      </div>
    );
  };

  // ═══ LOGIN SCREEN ═══
  if (!role || (!baseSel && role !== "coordenador" && role !== "programador")) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b1121", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@600;700;800&display=swap');`}</style>
        <div style={{ textAlign: "center", padding: 30, width: "100%", maxWidth: 340 }}>
          <img src="/Procel.jpeg" alt="Procellecorp" style={{ width: 220, margin: "0 auto 16px", display: "block", borderRadius: 8 }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", marginBottom: 4 }}>Indicadores Procel</h1>
          <p style={{ fontSize: 12, color: "#4b6080", marginBottom: 24 }}>Controle BT / MT</p>

          {!role ? (
            <>
              <button onClick={() => setRole("auxiliar")} style={{ width: "100%", padding: "14px 24px", marginBottom: 10, background: "linear-gradient(135deg,#eab308,#d97706)", color: "#0b1121", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Auxiliar Técnico</button>
              <div style={{ fontSize: 10, color: "#4b6080", marginBottom: 20 }}>Produção, pontos, retrabalho, preparação</div>

              {!showSenha ? (
                <button onClick={() => setShowSenha(true)} style={{ width: "100%", padding: "14px 24px", marginBottom: 10, background: "transparent", color: "#60a5fa", border: "2px solid #1e2d48", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Gerente</button>
              ) : (
                <div style={{ background: "#111d33", borderRadius: 14, padding: 20, border: "1px solid #1e2d48", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", marginBottom: 12 }}>🔒 Acesso Gerente</div>
                  <input type="password" value={gestorSenha} onChange={e => { setGestorSenha(e.target.value); setGestorErro(false); }}
                    onKeyDown={e => { if (e.key === "Enter") { if (gestorSenha === GESTOR_SENHA) { setRole("gestor"); setGestorSenha(""); setShowSenha(false); } else setGestorErro(true); } }}
                    placeholder="Senha" style={{ ...inp, marginBottom: 8, textAlign: "center", fontSize: 16, letterSpacing: 4 }} />
                  {gestorErro && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 8, fontWeight: 600 }}>Senha incorreta</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setShowSenha(false); setGestorSenha(""); }} style={{ flex: 1, padding: "10px 0", background: "#1e2d48", color: "#5a7aa0", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                    <button onClick={() => { if (gestorSenha === GESTOR_SENHA) { setRole("gestor"); setGestorSenha(""); setShowSenha(false); } else setGestorErro(true); }} style={{ flex: 1, padding: "10px 0", background: "linear-gradient(135deg,#3b9eff,#2563eb)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Entrar</button>
                  </div>
                </div>
              )}

              <button onClick={() => { setRole("coordenador"); setBaseSel("all"); setScreen("visao_geral"); }} style={{ width: "100%", padding: "14px 24px", background: "transparent", color: "#a78bfa", border: "2px solid #1e2d48", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Coordenador</button>
              <div style={{ fontSize: 10, color: "#4b6080", marginTop: 6, marginBottom: 16 }}>Visão consolidada de todas as bases</div>

              <button onClick={() => { setRole("programador"); setBaseSel("all"); setScreen("prog_import"); }} style={{ width: "100%", padding: "12px 24px", background: "transparent", color: "#22d3ee", border: "1.5px dashed #1e2d48", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⚙️ Programador</button>
              <div style={{ fontSize: 10, color: "#4b6080", marginTop: 6 }}>Importação de retrabalhos e configurações</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginBottom: 16 }}>Selecione sua base:</div>
              {BASES.map(b => (
                <button key={b.id} onClick={() => setBaseSel(b.id)} style={{ width: "100%", padding: "14px 20px", marginBottom: 8, background: "#111d33", color: "#f1f5f9", border: "1.5px solid #1e2d48", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{b.nome}</span>
                  <span style={{ fontSize: 11, color: "#5a7aa0" }}>{b.sigla} →</span>
                </button>
              ))}
              <button onClick={() => setRole(null)} style={{ marginTop: 8, background: "none", border: "none", color: "#5a7aa0", fontSize: 12, cursor: "pointer" }}>← Voltar</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const isGestor = role === "gestor" || role === "coordenador";
  const isCoordenador = role === "coordenador";
  const isProgramador = role === "programador";
  const tabs = isProgramador
    ? [{ k: "prog_import", l: "Importar Retrab." }]
    : isCoordenador
    ? [{ k: "visao_geral", l: "Visão Geral" }, { k: "relatorio", l: "Relatório" }, { k: "programacao_dia", l: "Programação" }]
    : isGestor
    ? [{ k: "home", l: "Painel" }, { k: "gerencial", l: "Gerencial" }, { k: "ranking", l: "Ranking" }, { k: "historico", l: "Histórico" }, { k: "retrabalho", l: "Retrab." }, { k: "preparacao_view", l: "Prepar." }, { k: "inspecoes", l: "Inspeções" }, { k: "status", l: "Status" }, { k: "import", l: "Importar" }]
    : [{ k: "home", l: "Painel" }, { k: "ranking", l: "Ranking" }, { k: "retrabalho", l: "Retrab." }, { k: "preparacao_view", l: "Prepar." }, { k: "status", l: "Status" }, { k: "import", l: "Importar" }];

  // ═══ MAIN APP ═══
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b1121", color: "#d4dce9", fontFamily: "'DM Sans',system-ui,sans-serif", overflowY: "auto", zIndex: 9999 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700;800&display=swap');*{box-sizing:border-box;margin:0}input,select,button{font-family:inherit}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2d3d56;border-radius:3px}.m{font-family:'JetBrains Mono',monospace}`}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f1a2e,#162240)", padding: "10px 16px", borderBottom: "1px solid #1e2d48" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/Procel.jpeg" alt="Procel" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "contain", background: "#fff", padding: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#f8fafc" }}>Indicadores Procel</div>
              <div style={{ fontSize: 9, color: "#4b6080", fontWeight: 600 }}>
                {role === "coordenador" ? "👑 Coordenador" : isProgramador ? "⚙️ Programador" : isGestor ? "👔 Gerente" : "🔧 Auxiliar"} · {notas.length} notas
                {alertasNaoLidos.length > 0 && <span style={{ marginLeft: 6, padding: "1px 6px", background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 800 }}>🔔 {alertasNaoLidos.length}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!isCoordenador && !isProgramador && (
              <select value={baseSel || ""} onChange={e => { setBaseSel(e.target.value); setScreen("home"); }} style={{ padding: "4px 6px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 6, color: "#eab308", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                {BASES.map(b => <option key={b.id} value={b.id}>{b.sigla}</option>)}
              </select>
            )}
            {["home", "detalhe"].includes(screen) && <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={{ padding: "4px 6px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 6, color: "#94a3b8", fontSize: 11 }} />}
            <button onClick={() => { setRole(null); setBaseSel(null); setScreen("home"); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>Sair</button>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", background: "#0f1525", borderBottom: "1px solid #1a2236", overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setScreen(t.k)} style={{ flex: "1 0 auto", padding: "9px 6px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer", background: screen === t.k ? "#1a2236" : "transparent", color: screen === t.k ? "#eab308" : "#4b6080", borderBottom: screen === t.k ? "2px solid #eab308" : "2px solid transparent", whiteSpace: "nowrap" }}>{t.l}</button>
        ))}
      </div>

      {importMsg && <div style={{ margin: "8px 14px", padding: "8px 12px", background: importMsg.includes("Erro") ? "rgba(239,68,68,.1)" : "rgba(34,197,94,.1)", borderRadius: 8, fontSize: 11, color: importMsg.includes("Erro") ? "#ef4444" : "#22c55e", fontWeight: 600 }}>{importMsg}</div>}
      {notasLoading && <div style={{ padding: 40, textAlign: "center", color: "#4b6080" }}>Carregando dados...</div>}

      {/* ═══ ALERTAS DE RETRABALHO ═══ */}
      {isGestor && alertasNaoLidos.length > 0 && (
        <div style={{ padding: "8px 14px 0" }}>
          {alertasNaoLidos.map(a => (
            <div key={a._fbKey} style={{ background: "rgba(239,68,68,.1)", border: "1.5px solid rgba(239,68,68,.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 8, animation: "pulse 2s infinite" }}>
              <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .85; } }`}</style>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", marginBottom: 4 }}>🔴 Novo Retrabalho!</div>
                  <div style={{ fontSize: 11, color: "#e2e8f0" }}>Nota: <strong>{a.nota}</strong></div>
                  <div style={{ fontSize: 10, color: "#fb923c" }}>{a.qtdPontos} ponto(s) com irregularidade</div>
                  <div style={{ fontSize: 9, color: "#5a7aa0", marginTop: 2 }}>{a.data} · {a.arquivo}</div>
                </div>
                <button onClick={() => fbSet(bp + "/alertas/" + a._fbKey + "/lido", true)} style={{ padding: "6px 12px", background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, color: "#ef4444", cursor: "pointer", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>OK, Ciente</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ PROGRAMADOR - IMPORTAR RETRABALHOS ═══ */}
      {screen === "prog_import" && isProgramador && (() => {
        const fbToArrLocal = (obj) => { if (!obj) return []; if (Array.isArray(obj)) return obj; return Object.entries(obj).map(([k, v]) => ({ ...v, _fbKey: k })); };
        
        const [importResults, setImportResults] = [retForm?.importResults || [], (v) => setRetForm(f => ({ ...f, importResults: v }))];
        const [importStatus, setImportStatus] = [retForm?.importStatus || "", (v) => setRetForm(f => ({ ...f, importStatus: v }))];
        
        const processFiles = async (e) => {
          const files = Array.from(e.target.files);
          if (!files.length) return;
          setImportStatus("Processando " + files.length + " arquivo(s)...");
          const results = [];
          
          for (const file of files) {
            try {
              const data = await file.arrayBuffer();
              const wb = XLSX.read(data, { type: "array" });
              const ws = wb.Sheets[wb.SheetNames[0]];
              
              // Read nota number from row 2, col C
              const notaNum = String(ws["C2"]?.v || "").trim();
              if (!notaNum) { results.push({ file: file.name, error: "Nota não encontrada" }); continue; }
              
              // Find which base has this nota
              let foundBase = null, foundBaseId = null;
              for (const base of BASES) {
                const bd = allBasesRaw?.[base.id] || {};
                const bNotas = fbToArrLocal(bd.notas);
                const match = bNotas.find(n => n.nome === notaNum || n.nome?.includes(notaNum) || notaNum.includes(n.nome));
                if (match) { foundBase = base; foundBaseId = base.id; break; }
              }
              
              // Read irregularidades from row 8+
              const pontos = [];
              let row = 8;
              while (true) {
                const pv = ws[XLSX.utils.encode_cell({r: row-1, c: 0})]?.v;
                if (!pv || !String(pv).match(/^P\d/i)) break;
                const irreg = String(ws[XLSX.utils.encode_cell({r: row-1, c: 3})]?.v || "").trim();
                const qtd = Number(ws[XLSX.utils.encode_cell({r: row-1, c: 5})]?.v) || 1;
                const obs = String(ws[XLSX.utils.encode_cell({r: row-1, c: 8})]?.v || "").trim();
                const dataCell = ws[XLSX.utils.encode_cell({r: row-1, c: 14})]?.v;
                let dataStr = "";
                if (dataCell) {
                  if (typeof dataCell === "number") {
                    const d = XLSX.SSF.parse_date_code(dataCell);
                    dataStr = d.y + "-" + String(d.m).padStart(2,"0") + "-" + String(d.d).padStart(2,"0");
                  } else {
                    const parts = String(dataCell).match(/(\d+)\/(\d+)\/(\d+)/);
                    if (parts) dataStr = (parts[3].length === 2 ? "20"+parts[3] : parts[3]) + "-" + parts[1].padStart(2,"0") + "-" + parts[2].padStart(2,"0");
                  }
                }
                const reg = String(ws[XLSX.utils.encode_cell({r: row-1, c: 15})]?.v || "").trim();
                
                // Find equipe that executed this ponto
                let eqId = "";
                if (foundBaseId) {
                  const bd = allBasesRaw?.[foundBaseId] || {};
                  const bNotas = fbToArrLocal(bd.notas);
                  const bAtribs = fbToArrLocal(bd.atribs);
                  const nota = bNotas.find(n => n.nome === notaNum || n.nome?.includes(notaNum));
                  if (nota) {
                    const ponto = (nota.pontos || []).find(p => p.n === String(pv));
                    if (ponto) {
                      for (const a of bAtribs) {
                        if (a.notaId === nota.id && (a.pIds || []).includes(ponto.id)) { eqId = a.eqId; break; }
                      }
                    }
                  }
                }
                
                pontos.push({ ponto: String(pv), motivo: irreg, qtd, obs, data: dataStr || today, regularizado: reg, eqId });
                row++;
              }
              
              const eqsFound = pontos.filter(p => p.eqId).length;
              results.push({ file: file.name, nota: notaNum, base: foundBase, baseId: foundBaseId, pontos, eqsFound, saved: false });
            } catch (err) {
              results.push({ file: file.name, error: err.message });
            }
          }
          setImportResults(results);
          setImportStatus("✅ " + results.length + " arquivo(s) processado(s)");
          e.target.value = "";
        };
        
        const saveAll = () => {
          let count = 0;
          importResults.forEach(r => {
            if (r.error || !r.baseId || r.saved) return;
            r.pontos.forEach(p => {
              // Find nota ID in the base
              const bd = allBasesRaw?.[r.baseId] || {};
              const bNotas = fbToArrLocal(bd.notas);
              const nota = bNotas.find(n => n.nome === r.nota || n.nome?.includes(r.nota));
              
              push(ref(db, `bases/${r.baseId}/retrab`), {
                eqId: p.eqId || "supervisor",
                data: p.data,
                notaId: nota?.id || "",
                pontoNome: p.ponto,
                qtd: p.qtd,
                motivo: p.motivo,
                obs: p.obs,
              });
              count++;
            });
            r.saved = true;
          });
          setImportResults([...importResults]);
          setImportStatus("✅ " + count + " retrabalho(s) salvos!");
        };
        
        const totalPontos = importResults.reduce((s, r) => s + (r.pontos?.length || 0), 0);
        const porBase = {};
        importResults.filter(r => !r.error).forEach(r => { const bn = r.base?.nome || "Não identificada"; porBase[bn] = (porBase[bn] || 0) + (r.pontos?.length || 0); });
        
        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>⚙️ Importar Retrabalhos</h2>
            <p style={{ fontSize: 11, color: "#5a7aa0", marginBottom: 14 }}>Selecione os arquivos Excel (Irr_e_Obs) do Google Drive</p>
            
            <label style={{ display: "block", width: "100%", padding: "14px 0", background: "linear-gradient(135deg,#22d3ee,#0891b2)", color: "#0b1121", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", textAlign: "center", marginBottom: 12 }}>
              📂 Selecionar Arquivos Excel
              <input type="file" accept=".xlsx,.xls" multiple onChange={processFiles} style={{ display: "none" }} />
            </label>
            
            {importStatus && <div style={{ padding: "8px 12px", background: "#111d33", borderRadius: 8, border: "1px solid #1e2d48", marginBottom: 12, fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>{importStatus}</div>}
            
            {/* Resumo por base */}
            {Object.keys(porBase).length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {Object.entries(porBase).map(([base, count]) => (
                  <div key={base} style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                    <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>{base}</div>
                    <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#22d3ee" }}>{count}</div>
                    <div style={{ fontSize: 9, color: "#5a7aa0" }}>retrab.</div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Lista de resultados */}
            {importResults.map((r, i) => (
              <div key={i} style={{ background: r.error ? "rgba(239,68,68,.06)" : r.saved ? "rgba(52,211,153,.06)" : "#111d33", borderRadius: 10, padding: "10px 12px", marginBottom: 4, border: "1px solid " + (r.error ? "rgba(239,68,68,.2)" : r.saved ? "rgba(52,211,153,.2)" : "#1e2d48") }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>Nota: {r.nota || "?"}</div>
                    <div style={{ fontSize: 9, color: "#5a7aa0" }}>{r.file}</div>
                  </div>
                  {r.error ? (
                    <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 700 }}>❌ {r.error}</span>
                  ) : r.saved ? (
                    <span style={{ fontSize: 10, color: "#34d399", fontWeight: 700 }}>✅ Salvo</span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#22d3ee", fontWeight: 700 }}>{r.pontos?.length} ponto(s)</span>
                  )}
                </div>
                {r.base && <div style={{ fontSize: 9, color: "#3b9eff", marginTop: 2 }}>Base: {r.base.nome} ({r.base.sigla})</div>}
                {!r.base && !r.error && <div style={{ fontSize: 9, color: "#f97316", marginTop: 2 }}>⚠️ Base não identificada — nota não encontrada nas bases</div>}
                {r.pontos && r.pontos.length > 0 && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ fontSize: 9, color: "#5a7aa0", cursor: "pointer" }}>▶ {r.pontos.length} irregularidade(s)</summary>
                    <div style={{ padding: "4px 0" }}>
                      {r.pontos.map((p, j) => {
                        const eq = r.baseId ? (EQUIPES_POR_BASE[r.baseId] || []).find(e => e.id === p.eqId) : null;
                        return (
                          <div key={j} style={{ fontSize: 9, color: "#94a3b8", padding: "2px 0", borderBottom: "1px solid #1a2540" }}>
                            <strong style={{ color: "#e2e8f0" }}>{p.ponto}</strong>: {p.motivo}
                            {eq && <span style={{ color: "#3b9eff" }}> → {eq.enc}</span>}
                            {!eq && p.eqId && <span style={{ color: "#f97316" }}> → equipe não encontrada</span>}
                            {p.obs && <span style={{ color: "#5a7aa0" }}> ({p.obs})</span>}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>
            ))}
            
            {/* Salvar */}
            {importResults.length > 0 && !importResults.every(r => r.saved || r.error) && (
              <button onClick={saveAll} style={{ width: "100%", padding: "14px 0", marginTop: 12, background: "linear-gradient(135deg,#22d3ee,#0891b2)", color: "#0b1121", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                💾 Salvar {totalPontos} retrabalho(s) nas bases
              </button>
            )}
            
            {importResults.length > 0 && (
              <button onClick={() => { setImportResults([]); setImportStatus(""); }} style={{ width: "100%", padding: "10px 0", marginTop: 8, background: "#1e2d48", color: "#5a7aa0", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Limpar resultados</button>
            )}
          </div>
        );
      })()}

      {/* ═══ VISÃO GERAL (coordenador) ═══ */}
      {screen === "visao_geral" && isCoordenador && (() => {
        const fbToArrLocal = (obj) => { if (!obj) return []; if (Array.isArray(obj)) return obj; return Object.entries(obj).map(([k, v]) => ({ ...v, _fbKey: k })); };
        
        const baseStats = BASES.map(base => {
          const bd = allBasesRaw?.[base.id] || {};
          const bNotas = fbToArrLocal(bd.notas);
          const bAtribs = fbToArrLocal(bd.atribs);
          const bRetrab = fbToArrLocal(bd.retrab);
          const bPreps = fbToArrLocal(bd.preps);
          const bInsp = fbToArrLocal(bd.inspecoes);
          const bEqs = EQUIPES_POR_BASE[base.id] || [];
          
          // Filter by selected month
          const mAtribs = bAtribs.filter(a => a.data?.startsWith(histMonth));
          const mRetrab = bRetrab.filter(r => r.data?.startsWith(histMonth));
          const mPreps = bPreps.filter(p => p.data?.startsWith(histMonth));
          const mInsp = bInsp.filter(i => i.data?.startsWith(histMonth));
          
          // Produção US
          let totalUS = 0, totalPrevUS = 0;
          let ptsConcl = 0, ptsProg = 0, ptsNao = 0;
          mAtribs.forEach(a => {
            const nota = bNotas.find(n => n.id === a.notaId);
            if (!nota) return;
            const pts = (nota.pontos || []).filter(p => (a.pIds || []).includes(p.id));
            ptsProg += pts.length;
            totalPrevUS += pts.reduce((s, p) => s + (p.u || 0), 0);
            pts.forEach(p => {
              const st = (a.status || {})[p.id];
              if (st === "ok") { totalUS += p.u || 0; ptsConcl++; }
              if (st === "no") ptsNao++;
            });
          });
          
          // Extras
          mAtribs.forEach(a => { (a.extras || []).forEach(e => { totalUS += (Number(e.valor) || 0) / DIVISOR_US; }); });
          
          // Preparação
          const prepUS = mPreps.reduce((s, p) => s + (Number(p.us) || 0), 0);
          totalUS += prepUS;
          
          const totalRetrab = mRetrab.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
          const diasTrab = new Set(mAtribs.map(a => a.data)).size;
          const metaMes = bEqs.reduce((s, eq) => s + (eq.meta || 0) * DIAS_UTEIS, 0);
          const txConclusao = ptsProg > 0 ? Math.round(ptsConcl / ptsProg * 100) : 0;
          const txProdutividade = metaMes > 0 ? Math.round(totalUS / metaMes * 100) : 0;
          const txQualidade = ptsConcl > 0 ? Math.max(0, Math.round((1 - totalRetrab / ptsConcl) * 100)) : 100;
          const score = Math.min(100, Math.round(txConclusao * 0.25 + txProdutividade * 0.30 + txQualidade * 0.25 + (metaMes > 0 ? totalUS / metaMes * 100 : 0) * 0.20));
          
          return {
            ...base, totalUS: Math.round(totalUS * 100) / 100, totalPrevUS: Math.round(totalPrevUS * 100) / 100,
            totalRetrab, diasTrab, metaMes, ptsConcl, ptsProg,
            txConclusao, txProdutividade, txQualidade, score,
            notas: bNotas.length, equipes: bEqs.length, inspecoes: mInsp.length, preps: mPreps.length,
          };
        });

        const totalGeralUS = baseStats.reduce((s, b) => s + b.totalUS, 0);
        const totalRetrabGeral = baseStats.reduce((s, b) => s + b.totalRetrab, 0);
        const avgScore = baseStats.length > 0 ? Math.round(baseStats.reduce((s, b) => s + b.score, 0) / baseStats.length) : 0;
        const scoreCol = s => s >= 80 ? "#34d399" : s >= 60 ? "#facc15" : s >= 40 ? "#f97316" : "#ef4444";
        const BASE_COLORS = ["#3b9eff", "#34d399", "#facc15"];

        // Radar data
        const radarData = [
          { criterio: "Conclusão", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.txConclusao])) },
          { criterio: "Produtividade", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.txProdutividade])) },
          { criterio: "Qualidade", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.txQualidade])) },
          { criterio: "Score", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.score])) },
        ];

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>👑 Visão Geral — Coordenação</h2>
            <MonthNav value={histMonth} onChange={setHistMonth} style={{ width: "100%", marginBottom: 14 }} />

            {/* KPIs gerais */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "12px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #3b9eff" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Produção Total</div>
                <div className="m" style={{ fontSize: 20, fontWeight: 800, color: "#3b9eff" }}>{fUS(totalGeralUS)}</div>
                <div style={{ fontSize: 9, color: "#5a7aa0" }}>US no mês</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "12px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #ef4444" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Retrabalhos</div>
                <div className="m" style={{ fontSize: 20, fontWeight: 800, color: totalRetrabGeral > 0 ? "#ef4444" : "#2d3d56" }}>{totalRetrabGeral}</div>
                <div style={{ fontSize: 9, color: "#5a7aa0" }}>total 3 bases</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "12px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid " + scoreCol(avgScore) }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Score Médio</div>
                <div className="m" style={{ fontSize: 20, fontWeight: 800, color: scoreCol(avgScore) }}>{avgScore}</div>
                <div style={{ fontSize: 9, color: "#5a7aa0" }}>de 100</div>
              </div>
            </div>

            {/* Previsão de Meta Global */}
            {(() => {
              const totalMeta = baseStats.reduce((s, b) => s + b.metaMes, 0);
              const totalDiasTrab = Math.max(...baseStats.map(b => b.diasTrab), 1);
              const mediaDiaGlobal = totalDiasTrab > 0 ? totalGeralUS / totalDiasTrab : 0;
              const diasRestantes = DIAS_UTEIS - totalDiasTrab;
              const projecaoGlobal = totalGeralUS + (mediaDiaGlobal * diasRestantes);
              const pctProjecao = totalMeta > 0 ? Math.round(projecaoGlobal / totalMeta * 100) : 0;
              const vaiBater = pctProjecao >= 100;
              
              if (totalDiasTrab === 0) return null;
              return (
                <div style={{ background: "#111d33", borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: "1px solid " + (vaiBater ? "rgba(52,211,153,.2)" : "rgba(239,68,68,.2)") }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>📊 Previsão Global</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: vaiBater ? "#34d399" : "#ef4444" }}>{vaiBater ? "✅ No caminho" : "⚠️ Abaixo"} · {pctProjecao}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 8, color: "#5a7aa0" }}>Média/dia</div><div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#3b9eff" }}>{fUS(mediaDiaGlobal)}</div></div>
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 8, color: "#5a7aa0" }}>Projeção</div><div className="m" style={{ fontSize: 14, fontWeight: 800, color: vaiBater ? "#34d399" : "#facc15" }}>{fUS(projecaoGlobal)}</div></div>
                    <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 8, color: "#5a7aa0" }}>Meta</div><div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#5a7aa0" }}>{fUS(totalMeta)}</div></div>
                  </div>
                  <div style={{ height: 6, background: "#1a2540", borderRadius: 6, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: Math.min(pctProjecao, 100) + "%", background: vaiBater ? "#34d399" : "linear-gradient(90deg,#facc15,#ef4444)", borderRadius: 6 }} />
                  </div>
                </div>
              );
            })()}

            {/* Cards por base */}
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Performance por Base</div>
            {baseStats.map((b, i) => (
              <div key={b.id} style={{ background: "#111d33", borderRadius: 14, padding: 14, marginBottom: 10, border: "1.5px solid " + BASE_COLORS[i] + "30", borderLeft: "4px solid " + BASE_COLORS[i] }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>{b.nome}</div>
                    <div style={{ fontSize: 9, color: "#5a7aa0" }}>{b.equipes} equipes · {b.notas} notas · {b.diasTrab} dia(s)</div>
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: scoreCol(b.score) + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="m" style={{ fontSize: 14, fontWeight: 800, color: scoreCol(b.score) }}>{b.score}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700 }}>PRODUÇÃO</div>
                    <div className="m" style={{ fontSize: 13, fontWeight: 800, color: "#34d399" }}>{fUS(b.totalUS)}</div>
                    <div style={{ fontSize: 8, color: "#5a7aa0" }}>US</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700 }}>CONCLUSÃO</div>
                    <div className="m" style={{ fontSize: 13, fontWeight: 800, color: pctCol(b.txConclusao) }}>{b.txConclusao}%</div>
                    <div style={{ fontSize: 8, color: "#5a7aa0" }}>{b.ptsConcl}/{b.ptsProg}</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700 }}>QUALIDADE</div>
                    <div className="m" style={{ fontSize: 13, fontWeight: 800, color: pctCol(b.txQualidade) }}>{b.txQualidade}%</div>
                    <div style={{ fontSize: 8, color: "#5a7aa0" }}>{b.totalRetrab} retrab.</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700 }}>INSPEÇÕES</div>
                    <div className="m" style={{ fontSize: 13, fontWeight: 800, color: "#a78bfa" }}>{b.inspecoes}</div>
                    <div style={{ fontSize: 8, color: "#5a7aa0" }}>no mês</div>
                  </div>
                </div>
              </div>
            ))}

            {/* Radar comparativo */}
            <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 4, marginBottom: 4 }}>Comparativo entre Bases</div>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#1e2d48" />
                  <PolarAngleAxis dataKey="criterio" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} />
                  {baseStats.map((b, i) => (
                    <Radar key={b.id} name={b.sigla} dataKey={b.sigla} stroke={BASE_COLORS[i]} fill={BASE_COLORS[i]} fillOpacity={0.1} strokeWidth={2.5} dot={{ r: 4, fill: BASE_COLORS[i] }} />
                  ))}
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 700, marginBottom: 4 }}>{label}</div>{payload.map((p, i) => <div key={i} style={{ fontSize: 10, color: p.stroke }}>{BASES.find(b => b.sigla === p.name)?.nome}: {p.value}%</div>)}</div> : null} />
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
                {baseStats.map((b, i) => (
                  <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: BASE_COLORS[i] }}></span>{b.nome}
                  </span>
                ))}
              </div>
            </div>

            {/* Barras comparativas - Produção */}
            <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Produção US por Base</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={baseStats} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fill: "#5a7aa0", fontSize: 10 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                  <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700 }}>{payload[0]?.payload?.nome}</div><div style={{ fontSize: 11, color: "#34d399" }}>Realizado: {fUS(payload[0]?.value)} US</div><div style={{ fontSize: 11, color: "#3b9eff" }}>Meta: {fUS(payload[0]?.payload?.metaMes)} US</div></div> : null} />
                  <Bar dataKey="totalUS" name="Realizado" radius={[6, 6, 0, 0]} barSize={40}>
                    {baseStats.map((b, i) => <Cell key={i} fill={BASE_COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Retrabalhos comparativo */}
            <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Retrabalhos por Base</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={baseStats} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                  <XAxis dataKey="nome" tick={{ fill: "#5a7aa0", fontSize: 10 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                  <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Bar dataKey="totalRetrab" name="Retrabalhos" radius={[6, 6, 0, 0]} barSize={40}>
                    {baseStats.map((b, i) => <Cell key={i} fill={b.totalRetrab > 0 ? "#ef4444" : "#1e2d48"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}

      {/* ═══ RELATÓRIO (coordenador) ═══ */}
      {screen === "relatorio" && isCoordenador && (() => {
        const fbToArrLocal = (obj) => { if (!obj) return []; if (Array.isArray(obj)) return obj; return Object.entries(obj).map(([k, v]) => ({ ...v, _fbKey: k })); };
        const [cy, cm] = histMonth.split("-").map(Number);
        const mesNome = MESES[cm] + " " + cy;
        
        const baseStats = BASES.map((base, bi) => {
          const bd = allBasesRaw?.[base.id] || {};
          const bNotas = fbToArrLocal(bd.notas);
          const bAtribs = fbToArrLocal(bd.atribs);
          const bRetrab = fbToArrLocal(bd.retrab);
          const bPreps = fbToArrLocal(bd.preps);
          const bInsp = fbToArrLocal(bd.inspecoes);
          const bStatus = bd.notaStatus || {};
          const bEqs = EQUIPES_POR_BASE[base.id] || [];
          
          const mAtribs = bAtribs.filter(a => a.data?.startsWith(histMonth));
          const mRetrab = bRetrab.filter(r => r.data?.startsWith(histMonth));
          
          let totalUS = 0, ptsConcl = 0, ptsProg = 0, conclusaoUS = 0;
          mAtribs.forEach(a => {
            const nota = bNotas.find(n => n.id === a.notaId);
            if (!nota) return;
            const pts = (nota.pontos || []).filter(p => (a.pIds || []).includes(p.id));
            ptsProg += pts.length;
            const isConcluida = bStatus[a.notaId] === "concluida";
            pts.forEach(p => {
              const st = (a.status || {})[p.id];
              if (st === "ok") { totalUS += p.u || 0; ptsConcl++; if (isConcluida) conclusaoUS += p.u || 0; }
            });
          });
          
          // Add prep and extras to totalUS
          mAtribs.forEach(a => { (a.extras || []).forEach(e => { totalUS += (Number(e.valor) || 0) / DIVISOR_US; }); });
          const prepUS = bPreps.filter(p => p.data?.startsWith(histMonth)).reduce((s, p) => s + (Number(p.us) || 0), 0);
          totalUS += prepUS;
          
          const totalRetrab = mRetrab.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
          const diasTrab = new Set(mAtribs.map(a => a.data)).size;
          const metaMes = bEqs.reduce((s, eq) => s + (eq.meta || 0) * DIAS_UTEIS, 0);
          const txConclusao = ptsProg > 0 ? Math.round(ptsConcl / ptsProg * 100) : 0;
          const txProdutividade = metaMes > 0 ? Math.round(totalUS / metaMes * 100) : 0;
          const txQualidade = ptsConcl > 0 ? Math.max(0, Math.round((1 - totalRetrab / ptsConcl) * 100)) : 100;
          const score = Math.min(100, Math.round(txConclusao * 0.25 + txProdutividade * 0.30 + txQualidade * 0.25 + Math.min(txProdutividade, 100) * 0.20));
          
          // Top equipes
          const eqRank = bEqs.filter(eq => eq.meta > 0).map(eq => {
            const eqA = mAtribs.filter(a => a.eqId === eq.id);
            let eqUS = 0;
            eqA.forEach(a => {
              const nota = bNotas.find(n => n.id === a.notaId);
              if (!nota) return;
              const pts = (nota.pontos || []).filter(p => (a.pIds || []).includes(p.id));
              pts.forEach(p => { if ((a.status || {})[p.id] === "ok") eqUS += p.u || 0; });
            });
            return { ...eq, us: Math.round(eqUS * 100) / 100 };
          }).sort((a, b) => b.us - a.us);
          
          return { ...base, totalUS: Math.round(totalUS * 100) / 100, conclusaoUS: Math.round(conclusaoUS * 100) / 100, totalRetrab, diasTrab, metaMes, ptsConcl, ptsProg, txConclusao, txProdutividade, txQualidade, score, equipes: bEqs.length, notas: bNotas.length, inspecoes: bInsp.filter(i => i.data?.startsWith(histMonth)).length, eqRank };
        });

        const totalGeralUS = baseStats.reduce((s, b) => s + b.totalUS, 0);
        const totalConclusaoUS = baseStats.reduce((s, b) => s + b.conclusaoUS, 0);
        const totalRetrabGeral = baseStats.reduce((s, b) => s + b.totalRetrab, 0);
        const avgScore = baseStats.length > 0 ? Math.round(baseStats.reduce((s, b) => s + b.score, 0) / baseStats.length) : 0;
        const totalEquipes = baseStats.reduce((s, b) => s + b.equipes, 0);
        const scoreCol = s => s >= 80 ? "#34d399" : s >= 60 ? "#facc15" : s >= 40 ? "#f97316" : "#ef4444";
        const BASE_COLORS = ["#3b9eff", "#34d399", "#facc15"];

        const radarData = [
          { criterio: "Conclusão", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.txConclusao])) },
          { criterio: "Produtividade", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.txProdutividade])) },
          { criterio: "Qualidade", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.txQualidade])) },
          { criterio: "Score", ...Object.fromEntries(baseStats.map(b => [b.sigla, b.score])) },
        ];

        return (
          <div style={{ padding: "0 0 100px", background: "#080e1a" }}>
            {/* Report Header */}
            <div style={{ background: "linear-gradient(135deg,#0f1a2e,#1a2d4d)", padding: "24px 20px", borderBottom: "3px solid #eab308" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <img src="/Procel.jpeg" alt="Procel" style={{ width: 50, height: 50, borderRadius: 10, objectFit: "contain", background: "#fff", padding: 3 }} />
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>Relatório de Performance</div>
                    <div style={{ fontSize: 12, color: "#eab308", fontWeight: 600 }}>Procellecorp — Indicadores Procel</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f8fafc" }}>{mesNome}</div>
                  <div style={{ fontSize: 10, color: "#5a7aa0" }}>{totalEquipes} equipes · 3 bases</div>
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 16px 0" }}>
              <MonthNav value={histMonth} onChange={setHistMonth} style={{ width: "100%", marginBottom: 16 }} />

              {/* KPIs Executive */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ background: "linear-gradient(135deg,#0d2818,#0f1a2e)", borderRadius: 14, padding: "16px 14px", border: "1px solid rgba(52,211,153,.2)" }}>
                  <div style={{ fontSize: 9, color: "#34d399", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Produção Total</div>
                  <div className="m" style={{ fontSize: 28, fontWeight: 800, color: "#34d399", marginTop: 4 }}>{fUS(totalGeralUS)}</div>
                  <div style={{ fontSize: 10, color: "#5a7aa0" }}>US produzidos no mês</div>
                </div>
                <div style={{ background: "linear-gradient(135deg,#0d1828,#0f1a2e)", borderRadius: 14, padding: "16px 14px", border: "1px solid rgba(59,158,255,.2)" }}>
                  <div style={{ fontSize: 9, color: "#3b9eff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Conclusão Base</div>
                  <div className="m" style={{ fontSize: 28, fontWeight: 800, color: "#3b9eff", marginTop: 4 }}>{fUS(totalConclusaoUS)}</div>
                  <div style={{ fontSize: 10, color: "#5a7aa0" }}>US obras concluídas</div>
                </div>
                <div style={{ background: "linear-gradient(135deg,#1a0d0d,#0f1a2e)", borderRadius: 14, padding: "16px 14px", border: "1px solid rgba(239,68,68,.2)" }}>
                  <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Retrabalhos</div>
                  <div className="m" style={{ fontSize: 28, fontWeight: 800, color: totalRetrabGeral > 0 ? "#ef4444" : "#2d3d56", marginTop: 4 }}>{totalRetrabGeral}</div>
                  <div style={{ fontSize: 10, color: "#5a7aa0" }}>irregularidades no mês</div>
                </div>
                <div style={{ background: "linear-gradient(135deg,#1a1a0d,#0f1a2e)", borderRadius: 14, padding: "16px 14px", border: "1px solid " + scoreCol(avgScore) + "33" }}>
                  <div style={{ fontSize: 9, color: scoreCol(avgScore), fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Score Médio</div>
                  <div className="m" style={{ fontSize: 28, fontWeight: 800, color: scoreCol(avgScore), marginTop: 4 }}>{avgScore}<span style={{ fontSize: 14, color: "#5a7aa0" }}>/100</span></div>
                  <div style={{ fontSize: 10, color: "#5a7aa0" }}>{avgScore >= 80 ? "Excelente" : avgScore >= 60 ? "Bom" : avgScore >= 40 ? "Regular" : "Crítico"}</div>
                </div>
              </div>

              {/* Radar Comparativo */}
              <div style={{ background: "#0d1525", borderRadius: 16, padding: "16px 10px", border: "1px solid #1e2d48", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, paddingLeft: 6, marginBottom: 8 }}>Comparativo entre Bases</div>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e2d48" />
                    <PolarAngleAxis dataKey="criterio" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} />
                    {baseStats.map((b, i) => (
                      <Radar key={b.id} name={b.nome} dataKey={b.sigla} stroke={BASE_COLORS[i]} fill={BASE_COLORS[i]} fillOpacity={0.1} strokeWidth={2.5} dot={{ r: 4, fill: BASE_COLORS[i] }} />
                    ))}
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 700, marginBottom: 4 }}>{label}</div>{payload.map((p, i) => <div key={i} style={{ fontSize: 10, color: p.stroke }}>{p.name}: {p.value}%</div>)}</div> : null} />
                  </RadarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
                  {baseStats.map((b, i) => (
                    <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#d4dce9", fontWeight: 600 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 6, background: BASE_COLORS[i] }}></span>{b.nome}
                    </span>
                  ))}
                </div>
              </div>

              {/* Base Cards */}
              <div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Performance por Base</div>
              {baseStats.map((b, i) => (
                <div key={b.id} style={{ background: "#0d1525", borderRadius: 16, padding: 16, marginBottom: 12, borderLeft: "4px solid " + BASE_COLORS[i], border: "1px solid #1e2d48" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: BASE_COLORS[i] }}>{b.nome}</div>
                      <div style={{ fontSize: 10, color: "#5a7aa0" }}>{b.equipes} equipes · {b.diasTrab} dia(s) trabalhado(s)</div>
                    </div>
                    <div style={{ width: 48, height: 48, borderRadius: 24, background: scoreCol(b.score) + "18", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid " + scoreCol(b.score) }}>
                      <span className="m" style={{ fontSize: 16, fontWeight: 800, color: scoreCol(b.score) }}>{b.score}</span>
                    </div>
                  </div>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Produção", value: fUS(b.totalUS) + " US", color: "#34d399" },
                      { label: "Conclusão", value: fUS(b.conclusaoUS) + " US", color: "#3b9eff" },
                      { label: "Qualidade", value: b.txQualidade + "%", color: pctCol(b.txQualidade) },
                      { label: "Retrab.", value: b.totalRetrab, color: b.totalRetrab > 0 ? "#ef4444" : "#2d3d56" },
                    ].map(k => (
                      <div key={k.label} style={{ textAlign: "center", background: "#080e1a", borderRadius: 8, padding: "8px 4px" }}>
                        <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>{k.label}</div>
                        <div className="m" style={{ fontSize: 13, fontWeight: 800, color: k.color }}>{k.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Progress bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {[
                      { label: "Conclusão", value: b.txConclusao, color: "#34d399" },
                      { label: "Produtividade", value: b.txProdutividade, color: "#3b9eff" },
                      { label: "Qualidade", value: b.txQualidade, color: "#a78bfa" },
                    ].map(bar => (
                      <div key={bar.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 8, color: "#5a7aa0", width: 65, textAlign: "right" }}>{bar.label}</span>
                        <div style={{ flex: 1, height: 8, background: "#1a2540", borderRadius: 8 }}>
                          <div style={{ height: "100%", width: Math.min(bar.value, 100) + "%", background: "linear-gradient(90deg," + bar.color + "," + bar.color + "cc)", borderRadius: 8 }} />
                        </div>
                        <span className="m" style={{ fontSize: 10, color: bar.color, fontWeight: 700, width: 35 }}>{bar.value}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Top 3 equipes */}
                  {b.eqRank.length > 0 && (
                    <div style={{ marginTop: 10, padding: "8px 0 0", borderTop: "1px solid #1a2540" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Top 3 Equipes</div>
                      {b.eqRank.slice(0, 3).map((eq, j) => (
                        <div key={eq.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: ["#eab308", "#94a3b8", "#cd7f32"][j], width: 16 }}>{j + 1}º</span>
                          <span style={{ flex: 1, fontSize: 10, color: "#d4dce9" }}>{eq.nome} - {eq.enc}</span>
                          <span className="m" style={{ fontSize: 10, fontWeight: 700, color: "#34d399" }}>{fUS(eq.us)} US</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Barras comparativas */}
              <div style={{ background: "#0d1525", borderRadius: 16, padding: "16px 8px", border: "1px solid #1e2d48", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, paddingLeft: 6, marginBottom: 8 }}>Produção vs Conclusão por Base</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={baseStats.map(b => ({ nome: b.nome, produção: b.totalUS, conclusão: b.conclusaoUS }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fill: "#5a7aa0", fontSize: 10 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                    <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700, marginBottom: 4 }}>{payload[0]?.payload?.nome}</div><div style={{ fontSize: 11, color: "#34d399" }}>Produção: {fUS(payload[0]?.value)} US</div><div style={{ fontSize: 11, color: "#3b9eff" }}>Conclusão: {fUS(payload[1]?.value)} US</div></div> : null} />
                    <Bar dataKey="produção" fill="#34d399" radius={[4, 4, 0, 0]} barSize={24} />
                    <Bar dataKey="conclusão" fill="#3b9eff" radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#34d399" }}></span>Produção</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#3b9eff" }}></span>Conclusão</span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ textAlign: "center", padding: "12px 0", borderTop: "1px solid #1a2540" }}>
                <div style={{ fontSize: 10, color: "#5a7aa0" }}>Relatório gerado em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                <div style={{ fontSize: 9, color: "#3a5070", marginTop: 2 }}>Procellecorp — Projetos e Construções Elétricas</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ PROGRAMAÇÃO DO DIA (coordenador) ═══ */}
      {screen === "programacao_dia" && isCoordenador && (() => {
        const fbToArrLocal = (obj) => { if (!obj) return []; if (Array.isArray(obj)) return obj; return Object.entries(obj).map(([k, v]) => ({ ...v, _fbKey: k })); };
        const BASE_COLORS = ["#3b9eff", "#34d399", "#facc15"];
        const [progSearch, setProgSearch] = [statusSearch, setStatusSearch];
        
        // Get programming for selected date from all bases
        const progDia = BASES.map((base, i) => {
          const bd = allBasesRaw?.[base.id] || {};
          const prog = bd.programacao?.[dataSel] || { notas: [], totalUS: 0, qtdNotas: 0 };
          const notasList = Array.isArray(prog.notas) ? prog.notas : Object.values(prog.notas || {});
          
          // Filter by search
          const filtered = progSearch
            ? notasList.filter(n => {
                const txt = [n.nota, n.municipio, n.regulatorio, n.status].join(" ").toLowerCase();
                return txt.includes(progSearch.toLowerCase());
              })
            : notasList;
          
          return {
            ...base,
            color: BASE_COLORS[i],
            notas: filtered,
            totalUS: filtered.reduce((s, n) => s + (Number(n.us) || 0), 0),
            qtdNotas: filtered.length,
            allNotas: notasList.length,
            allUS: notasList.reduce((s, n) => s + (Number(n.us) || 0), 0),
          };
        });
        
        const totalNotas = progDia.reduce((s, b) => s + b.qtdNotas, 0);
        const totalUS = progDia.reduce((s, b) => s + b.totalUS, 0);
        const totalAllNotas = progDia.reduce((s, b) => s + b.allNotas, 0);
        
        // Status breakdown
        const statusCount = {};
        progDia.forEach(b => b.notas.forEach(n => { const st = n.status || "Sem status"; statusCount[st] = (statusCount[st] || 0) + 1; }));
        const statusEntries = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
        
        // Regulatório breakdown
        const regCount = {};
        progDia.forEach(b => b.notas.forEach(n => { const r = n.regulatorio || "Outros"; regCount[r] = (regCount[r] || 0) + 1; }));
        const regEntries = Object.entries(regCount).sort((a, b) => b[1] - a[1]);
        const REG_COLORS = ["#3b9eff", "#34d399", "#facc15", "#ef4444", "#a78bfa", "#f97316", "#f472b6", "#22d3ee"];

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>📋 Programação do Dia</h2>
            
            {/* Date selector */}
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={{ width: "100%", marginBottom: 12, ...inp }} />
            
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#111d33", borderRadius: 12, padding: "14px 12px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #eab308" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Notas Programadas</div>
                <div className="m" style={{ fontSize: 28, fontWeight: 800, color: "#eab308" }}>{totalNotas}</div>
                <div style={{ fontSize: 9, color: "#5a7aa0" }}>{dataSel.split("-").reverse().join("/")}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 12, padding: "14px 12px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #34d399" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Total US Orçado</div>
                <div className="m" style={{ fontSize: 28, fontWeight: 800, color: "#34d399" }}>{Math.round(totalUS)}</div>
                <div style={{ fontSize: 9, color: "#5a7aa0" }}>US no dia</div>
              </div>
            </div>
            
            {/* Per base cards */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {progDia.map((b, i) => (
                <div key={b.id} style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid " + b.color }}>
                  <div style={{ fontSize: 9, color: b.color, fontWeight: 700 }}>{b.sigla}</div>
                  <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>{b.qtdNotas}</div>
                  <div className="m" style={{ fontSize: 10, color: "#34d399" }}>{Math.round(b.totalUS)} US</div>
                </div>
              ))}
            </div>
            
            {/* Bar chart - US por Base no dia */}
            {totalNotas > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>US Programados por Base</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={progDia.map(b => ({ nome: b.nome, us: Math.round(b.totalUS), notas: b.qtdNotas }))} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fill: "#5a7aa0", fontSize: 10 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                    <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700 }}>{payload[0]?.payload?.nome}</div><div style={{ fontSize: 11, color: "#34d399" }}>{payload[0]?.value} US</div><div style={{ fontSize: 10, color: "#5a7aa0" }}>{payload[0]?.payload?.notas} nota(s)</div></div> : null} />
                    <Bar dataKey="us" radius={[6, 6, 0, 0]} barSize={40}>
                      {progDia.map((b, i) => <Cell key={i} fill={b.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* Donut by regulatório */}
            {regEntries.length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 4, marginBottom: 6 }}>Por Tipo de Obra</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={regEntries.map(([name, value]) => ({ name, value }))} cx="50%" cy="50%" innerRadius={40} outerRadius={68} dataKey="value" stroke="none">
                      {regEntries.map((_, i) => <Cell key={i} fill={REG_COLORS[i % REG_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9" }}>{payload[0]?.name}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>{payload[0]?.value} nota(s)</div></div> : null} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
                  {regEntries.map(([name, count], i) => (
                    <span key={name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: REG_COLORS[i % REG_COLORS.length], flexShrink: 0 }}></span>
                      {name} ({count})
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* Status breakdown */}
            {statusEntries.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Status das Obras</div>
                {statusEntries.map(([st, count]) => {
                  const stColor = st.includes("EXECUÇ") ? "#eab308" : st.includes("REPROG") ? "#f97316" : st.includes("CONCLU") ? "#34d399" : "#5a7aa0";
                  return (
                    <div key={st} style={{ background: "#111d33", borderRadius: 6, padding: "6px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#d4dce9" }}>{st}</span>
                      <span className="m" style={{ fontSize: 12, fontWeight: 800, color: stColor }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Search */}
            <input value={progSearch} onChange={e => setProgSearch(e.target.value)} placeholder="🔍 Pesquisar nota, município, tipo..." style={{ ...inp, marginBottom: 10 }} />
            
            {/* Notas list by base */}
            {totalNotas === 0 && <div style={{ textAlign: "center", padding: 24, color: "#3a5070", fontSize: 12 }}>Nenhuma obra programada para {dataSel.split("-").reverse().join("/")}</div>}
            
            {progDia.filter(b => b.qtdNotas > 0).map((b, i) => (
              <div key={b.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: b.color }}>{b.nome}</span>
                  <span style={{ fontSize: 10, color: "#5a7aa0" }}>{b.qtdNotas} notas · {Math.round(b.totalUS)} US</span>
                </div>
                {b.notas.map((n, j) => (
                  <div key={j} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", borderLeft: "3px solid " + b.color }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{n.nota}</div>
                        <div style={{ fontSize: 9, color: "#5a7aa0" }}>
                          {n.municipio}{n.regulatorio ? " · " + n.regulatorio : ""}
                        </div>
                        {n.status && <div style={{ fontSize: 8, color: n.status.includes("EXECUÇ") ? "#eab308" : n.status.includes("REPROG") ? "#f97316" : "#5a7aa0", fontWeight: 600 }}>{n.status}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="m" style={{ fontSize: 13, fontWeight: 800, color: "#34d399" }}>{n.us}</div>
                        <div style={{ fontSize: 8, color: "#5a7aa0" }}>US</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ═══ HOME ═══ */}
      {!notasLoading && screen === "home" && (
        <div style={{ padding: "12px 14px 100px" }}>

          {/* Two Speedometers - Produção e Conclusão */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "linear-gradient(135deg,#0d1829,#132035)", borderRadius: 14, padding: "14px 8px", border: "1px solid #1a2d4d" }}>
              <div style={{ textAlign: "center", fontSize: 9, color: "#34d399", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Produção (equipes)</div>
              <Gauge value={mesTotalRealUS} max={mesMetaTotal} label="" sublabel="" />
              <div style={{ textAlign: "center", marginTop: 4 }}>
                <div className="m" style={{ fontSize: 11, color: "#5a7aa0" }}>Meta: {fUS(mesMetaTotal)} US</div>
              </div>
            </div>
            <div style={{ flex: 1, background: "linear-gradient(135deg,#0d1829,#132035)", borderRadius: 14, padding: "14px 8px", border: "1px solid #1a2d4d" }}>
              <div style={{ textAlign: "center", fontSize: 9, color: "#3b9eff", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Conclusão (obras)</div>
              <Gauge value={mesTotalConclusaoUS} max={mesMetaTotal} label="" sublabel="" />
              <div style={{ textAlign: "center", marginTop: 4 }}>
                <div className="m" style={{ fontSize: 11, color: "#5a7aa0" }}>{mesDiasComDados} dia(s) de {DIAS_UTEIS}</div>
              </div>
            </div>
          </div>

          {/* Previsão de Meta */}
          {mesDiasComDados > 0 && (
            <div style={{ background: "#111d33", borderRadius: 12, padding: "12px 14px", marginBottom: 12, border: "1px solid #1e2d48" }}>
              {(() => {
                const mediaDia = mesTotalRealUS / mesDiasComDados;
                const diasRestantes = DIAS_UTEIS - mesDiasComDados;
                const projecao = mesTotalRealUS + (mediaDia * diasRestantes);
                const pctProjecao = mesMetaTotal > 0 ? Math.round(projecao / mesMetaTotal * 100) : 0;
                const vaiBater = pctProjecao >= 100;
                const falta = mesMetaTotal - mesTotalRealUS;
                const precisaDia = diasRestantes > 0 ? falta / diasRestantes : 0;
                
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>📊 Previsão de Meta</div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: vaiBater ? "#34d399" : "#ef4444" }}>{vaiBater ? "✅ No caminho!" : "⚠️ Atenção"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: "#5a7aa0" }}>Média/dia</div>
                        <div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#3b9eff" }}>{fUS(mediaDia)}</div>
                      </div>
                      <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: "#5a7aa0" }}>Projeção mês</div>
                        <div className="m" style={{ fontSize: 14, fontWeight: 800, color: vaiBater ? "#34d399" : "#facc15" }}>{fUS(projecao)}</div>
                      </div>
                      <div style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: "#5a7aa0" }}>% da meta</div>
                        <div className="m" style={{ fontSize: 14, fontWeight: 800, color: vaiBater ? "#34d399" : "#ef4444" }}>{pctProjecao}%</div>
                      </div>
                    </div>
                    <div style={{ height: 8, background: "#1a2540", borderRadius: 8, marginBottom: 6, overflow: "hidden", position: "relative" }}>
                      <div style={{ height: "100%", width: Math.min(pctProjecao, 100) + "%", background: vaiBater ? "linear-gradient(90deg,#34d399,#22c55e)" : "linear-gradient(90deg,#facc15,#ef4444)", borderRadius: 8, transition: "width .5s" }} />
                      <div style={{ position: "absolute", top: 0, left: "100%", width: 2, height: "100%", background: "#ef4444", transform: "translateX(-2px)" }} />
                    </div>
                    {diasRestantes > 0 && !vaiBater && (
                      <div style={{ fontSize: 9, color: "#f97316", textAlign: "center" }}>
                        Precisa de <strong>{fUS(precisaDia)} US/dia</strong> nos próximos {diasRestantes} dia(s) para bater a meta
                      </div>
                    )}
                    {diasRestantes > 0 && vaiBater && (
                      <div style={{ fontSize: 9, color: "#34d399", textAlign: "center" }}>
                        Mantendo {fUS(mediaDia)} US/dia, fecha o mês com <strong>{fUS(projecao)} US</strong> ({pctProjecao}% da meta)
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Resumo do dia */}
          {doDia.length > 0 && (
            <div style={{ background: "linear-gradient(135deg,#0d1829,#162240)", borderRadius: 14, padding: 14, marginBottom: 12, border: "1px solid #1a2d4d" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Ring value={totRealUS} max={totPrevUS} size={70} stroke={6} />
                <div style={{ flex: 1 }}>
                  <div><span style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700 }}>PREV </span><span className="m" style={{ fontSize: 14, fontWeight: 800, color: "#3b9eff" }}>{BRL(totPrev)}</span><span className="m" style={{ fontSize: 10, color: "#5a7aa0", marginLeft: 4 }}>({fUS(totPrevUS)} US)</span></div>
                  <div><span style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700 }}>REAL </span><span className="m" style={{ fontSize: 14, fontWeight: 800, color: "#34d399" }}>{BRL(totReal)}</span><span className="m" style={{ fontSize: 10, color: "#5a7aa0", marginLeft: 4 }}>({fUS(totRealUS)} US)</span></div>
                </div>
              </div>
            </div>
          )}

          {!isGestor && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button onClick={() => { setAtribForm({ eqId: "", notaId: "", pIds: [] }); setScreen("atribuir"); }} style={{ flex: 1, padding: "12px 0", background: "linear-gradient(135deg,#f5c518,#e6a817)", color: "#0b1121", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(245,197,24,.2)" }}>+ Atribuir Pontos</button>
              <button onClick={() => { setPrepForm({ eqId: "", data: dataSel, notaId: "", qtdCavas: 1, obs: "" }); setPrepNotaBusca(""); setScreen("preparacao"); }} style={{ flex: 1, padding: "12px 0", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(249,115,22,.2)" }}>🔧 Preparação</button>
            </div>
          )}

          <div style={{ fontSize: 10, fontWeight: 700, color: "#5a7aa0", textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Equipes — {Object.keys(eqMap).length}/{EQUIPES.length}</div>

          {/* Alert: equipes abaixo da meta */}
          {(() => {
            const abaixoMeta = EQUIPES.filter(eq => {
              if (!eq.meta) return false;
              const ea = eqMap[eq.id] || [];
              if (!ea.length) return false;
              const prevUS = ea.reduce((s, a) => { const pts = getPts(a.notaId, a.pIds); return s + pts.reduce((ss, p) => ss + p.u, 0); }, 0);
              return prevUS < eq.meta;
            });
            if (abaixoMeta.length === 0) return null;
            return (
              <div style={{ background: "rgba(239,68,68,.06)", border: "1.5px solid rgba(239,68,68,.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444", marginBottom: 6 }}>⚠️ {abaixoMeta.length} equipe(s) com programação abaixo da meta</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {abaixoMeta.map(eq => {
                    const ea = eqMap[eq.id] || [];
                    const prevUS = ea.reduce((s, a) => { const pts = getPts(a.notaId, a.pIds); return s + pts.reduce((ss, p) => ss + p.u, 0); }, 0);
                    return (
                      <span key={eq.id} style={{ fontSize: 9, padding: "3px 8px", background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.15)", borderRadius: 6, color: "#fb923c" }}>
                        {eq.enc}: {fUS(prevUS)}/{eq.meta} US
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {EQUIPES.map(eq => {
              const ea = eqMap[eq.id] || [];
              const dayPrepUS = preps.filter(p => p.eqId === eq.id && p.data === dataSel).reduce((s, p) => s + (Number(p.us) || 0), 0);
              const dayCavaUS = getCavaUS(eq.id, c => c.data === dataSel);
              const extraPrepUS = dayPrepUS + dayCavaUS;
              
              if (!ea.length && extraPrepUS === 0) return (<div key={eq.id} style={{ background: "#0d1829", borderRadius: 10, padding: "10px 12px", border: "1px dashed #1a2d4d", opacity: .35, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><span style={{ fontSize: 11, fontWeight: 700, color: "#5a7aa0" }}>{eqLabel(eq)}</span><span style={{ fontSize: 9, color: tipoCor(eq.tipo), marginLeft: 6, fontWeight: 700 }}>{eq.tipo}</span></div><span style={{ fontSize: 10, color: "#2d3d56" }}>—</span></div>);
              
              if (!ea.length && extraPrepUS > 0) return (
                <div key={eq.id} style={{ background: "#0d1829", borderRadius: 12, border: "1.5px solid rgba(249,115,22,.2)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Ring value={extraPrepUS} max={eq.meta || extraPrepUS} size={46} stroke={4} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#f1f5f9" }}>{eqLabel(eq)} <span style={{ fontSize: 9, color: tipoCor(eq.tipo), fontWeight: 700, background: tipoCor(eq.tipo) + "18", padding: "1px 5px", borderRadius: 4 }}>{eq.tipo}</span></div>
                    <div style={{ fontSize: 10, color: "#f97316" }}>🔧 Só preparação</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#f97316" }}>{fUS(extraPrepUS)} US</div>
                    <div className="m" style={{ fontSize: 9, color: "#5a7aa0" }}>meta: {eq.meta} US</div>
                  </div>
                </div>
              );
              const t = getTotals(ea); const pc = pct(t.realUS, eq.meta);
              let okC = 0, totP = 0, execUS = 0;
              ea.forEach(a => { const pts = getPts(a.notaId, a.pIds); const st = a.status || {}; const svcSt = a.svcStatus || {};
                totP += pts.length;
                pts.forEach(p => {
                  if (st[p.id] === "ok") {
                    okC++;
                    if (svcSt[p.id] && p.svcs && p.svcs.length > 0) {
                      p.svcs.forEach(s => { if (svcSt[p.id][s.id] !== false) execUS += s.u; });
                    } else { execUS += p.u; }
                  }
                });
              });
              execUS = Math.round(execUS * 100) / 100;
              const extC = ea.reduce((s, a) => (a.extras || []).length + s, 0);
              const eqMesUS = getEqMonthUS(eq.id, histMonth);
              const mediaDia = mesDiasComDados > 0 ? (eqMesUS / mesDiasComDados) : 0;
              // Check if previsto is below meta
              const prevUS = t.prevUS;
              const abaixo = eq.meta > 0 && prevUS < eq.meta;
              return (
                <div key={eq.id} onClick={() => { setSelEq(ea); setScreen("detalhe"); }} style={{ background: "#0d1829", borderRadius: 12, border: abaixo ? "1.5px solid rgba(239,68,68,.3)" : "1.5px solid " + pctCol(pc) + "30", padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "border-color .2s" }}>
                  <Ring value={t.realUS} max={eq.meta || t.prevUS} size={46} stroke={4} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#f1f5f9" }}>{eqLabel(eq)} <span style={{ fontSize: 9, color: tipoCor(eq.tipo), fontWeight: 700, background: tipoCor(eq.tipo) + "18", padding: "1px 5px", borderRadius: 4 }}>{eq.tipo}</span></div>
                    <div style={{ fontSize: 10, color: "#5a7aa0" }}>✅ {okC}/{totP}{extC > 0 ? " · +" + extC + " extra" : ""}</div>
                    {abaixo && <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 700 }}>⚠️ Programado: {fUS(prevUS)} US — abaixo da meta ({eq.meta} US)</div>}
                    {!abaixo && <div style={{ fontSize: 9, color: "#3a5070" }}>Média mês: {fUS(mediaDia)} US/dia</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="m" style={{ fontSize: 13, fontWeight: 800, color: "#34d399" }}>{fUS(t.realUS)} <span style={{ fontSize: 8, color: "#5a7aa0" }}>prod.</span></div>
                    <div className="m" style={{ fontSize: 11, fontWeight: 700, color: "#3b9eff" }}>{fUS(execUS)} <span style={{ fontSize: 8, color: "#5a7aa0" }}>exec.</span></div>
                    <div className="m" style={{ fontSize: 8, color: "#5a7aa0" }}>meta: {eq.meta}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ GERENCIAL ═══ */}
      {screen === "gerencial" && (() => {
        const monthAtribs = atribs.filter(a => a.data?.startsWith(histMonth));
        const monthRetrab = retrab.filter(r => r.data?.startsWith(histMonth));
        
        const eqStats = EQUIPES.filter(eq => {
          if (eq.meta <= 0) return false;
          if (histEq === "all") return true;
          if (histEq.startsWith("tipo_")) return eq.tipo === histEq.replace("tipo_", "");
          return eq.id === histEq;
        }).map(eq => {
          const eqA = monthAtribs.filter(a => a.eqId === eq.id);
          
          // Pontos programados e concluídos
          let ptsProg = 0, ptsConcl = 0, ptsNao = 0;
          eqA.forEach(a => {
            const pts = getPts(a.notaId, a.pIds);
            ptsProg += pts.length;
            pts.forEach(p => {
              const s = (a.status || {})[p.id];
              if (s === "ok") ptsConcl++;
              if (s === "no") ptsNao++;
            });
          });
          
          // Produtividade US
          const mesUS = getEqMonthUS(eq.id, histMonth);
          const metaMes = eq.meta * DIAS_UTEIS;
          const diasTrab = new Set(eqA.map(a => a.data)).size;
          const mediaDia = diasTrab > 0 ? mesUS / diasTrab : 0;
          
          // Retrabalhos
          const eqRetrab = monthRetrab.filter(r => r.eqId === eq.id);
          const totalRetrab = eqRetrab.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
          
          // Taxas
          const txConclusao = ptsProg > 0 ? Math.round(ptsConcl / ptsProg * 100) : 0;
          const txProdutividade = metaMes > 0 ? Math.round(mesUS / metaMes * 100) : 0;
          const txQualidade = ptsConcl > 0 ? Math.max(0, Math.round((1 - totalRetrab / ptsConcl) * 100)) : 100;
          const txMeta = eq.meta > 0 ? Math.round(mediaDia / eq.meta * 100) : 0;
          
          // Score geral (média ponderada)
          const score = Math.round((txConclusao * 0.25 + txProdutividade * 0.30 + txQualidade * 0.25 + txMeta * 0.20));
          
          return {
            ...eq, ptsProg, ptsConcl, ptsNao, mesUS: Math.round(mesUS * 100) / 100, metaMes,
            diasTrab, mediaDia: Math.round(mediaDia * 100) / 100, totalRetrab,
            txConclusao, txProdutividade, txQualidade, txMeta,
            score: Math.min(score, 100),
          };
        }).sort((a, b) => b.score - a.score);

        // Radar data - top 6 equipes para não poluir
        const radarEquipes = eqStats.filter(e => e.diasTrab > 0).slice(0, 6);
        const radarData = [
          { criterio: "Conclusão", ...Object.fromEntries(radarEquipes.map(e => [e.enc, e.txConclusao])) },
          { criterio: "Produtividade", ...Object.fromEntries(radarEquipes.map(e => [e.enc, e.txProdutividade])) },
          { criterio: "Qualidade", ...Object.fromEntries(radarEquipes.map(e => [e.enc, e.txQualidade])) },
          { criterio: "Meta Diária", ...Object.fromEntries(radarEquipes.map(e => [e.enc, e.txMeta])) },
        ];
        const RADAR_COLORS = ["#34d399", "#3b9eff", "#facc15", "#f97316", "#a78bfa", "#f472b6"];

        // Médias gerais
        const avgConclusao = eqStats.length > 0 ? Math.round(eqStats.reduce((s, e) => s + e.txConclusao, 0) / eqStats.length) : 0;
        const avgProdutividade = eqStats.length > 0 ? Math.round(eqStats.reduce((s, e) => s + e.txProdutividade, 0) / eqStats.length) : 0;
        const avgQualidade = eqStats.length > 0 ? Math.round(eqStats.reduce((s, e) => s + e.txQualidade, 0) / eqStats.length) : 0;
        const avgScore = eqStats.length > 0 ? Math.round(eqStats.reduce((s, e) => s + e.score, 0) / eqStats.length) : 0;

        const scoreCol = s => s >= 80 ? "#34d399" : s >= 60 ? "#facc15" : s >= 40 ? "#f97316" : "#ef4444";

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>📋 Relatório Gerencial</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <MonthNav value={histMonth} onChange={setHistMonth} style={{ flex: 1 }} />
              <select value={histEq} onChange={e => setHistEq(e.target.value)} style={{ flex: 1, ...inp }}>
                <option value="all">Todas equipes</option>
                <option value="tipo_B3">Tipo B3</option>
                <option value="tipo_C1">Tipo C1</option>
                <option value="tipo_B1">Tipo B1</option>
                {EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}
              </select>
            </div>

            {/* KPIs gerais */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
              {[
                { label: "Conclusão", value: avgConclusao + "%", color: pctCol(avgConclusao) },
                { label: "Produtiv.", value: avgProdutividade + "%", color: pctCol(avgProdutividade) },
                { label: "Qualidade", value: avgQualidade + "%", color: pctCol(avgQualidade) },
                { label: "Score", value: avgScore, color: scoreCol(avgScore) },
              ].map(k => (
                <div key={k.label} style={{ background: "#111d33", borderRadius: 10, padding: "10px 6px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid " + k.color }}>
                  <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>{k.label}</div>
                  <div className="m" style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Comparativo Mensal */}
            {(() => {
              const mesAnt = prevMonth(histMonth);
              const mesAntAtribs = atribs.filter(a => a.data?.startsWith(mesAnt));
              const mesAntRetrab = retrab.filter(r => r.data?.startsWith(mesAnt));

              // Produção mês anterior
              let prodAnt = 0;
              EQUIPES.forEach(eq => { prodAnt += getEqMonthUS(eq.id, mesAnt); });
              
              // Produção mês atual
              let prodAtual = 0;
              EQUIPES.forEach(eq => { prodAtual += getEqMonthUS(eq.id, histMonth); });

              // Retrabalhos
              const retrabAnt = mesAntRetrab.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
              const retrabAtual = retrab.filter(r => r.data?.startsWith(histMonth)).reduce((s, r) => s + (Number(r.qtd) || 1), 0);

              // Pontos concluídos
              let ptsAnt = 0, ptsAtual = 0;
              mesAntAtribs.forEach(a => {
                const pts = getPts(a.notaId, a.pIds);
                pts.forEach(p => { if ((a.status || {})[p.id] === "ok") ptsAnt++; });
              });
              const mesAtualAtribs = atribs.filter(a => a.data?.startsWith(histMonth));
              mesAtualAtribs.forEach(a => {
                const pts = getPts(a.notaId, a.pIds);
                pts.forEach(p => { if ((a.status || {})[p.id] === "ok") ptsAtual++; });
              });

              const calcVar = (atual, anterior) => {
                if (anterior === 0) return atual > 0 ? 100 : 0;
                return Math.round((atual - anterior) / anterior * 100);
              };

              const items = [
                { label: "Produção US", atual: fUS(prodAtual), anterior: fUS(prodAnt), variacao: calcVar(prodAtual, prodAnt) },
                { label: "Pontos Concluídos", atual: ptsAtual, anterior: ptsAnt, variacao: calcVar(ptsAtual, ptsAnt) },
                { label: "Retrabalhos", atual: retrabAtual, anterior: retrabAnt, variacao: calcVar(retrabAtual, retrabAnt), inverso: true },
                { label: "Score Médio", atual: avgScore, anterior: "—", variacao: 0 },
              ];

              const mesAntNome = monthLabel(mesAnt);
              const mesAtualNome = monthLabel(histMonth);

              return (
                <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 14px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>📈 Comparativo: {mesAtualNome} vs {mesAntNome}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map(item => {
                      const isPositive = item.inverso ? item.variacao <= 0 : item.variacao >= 0;
                      const arrow = item.variacao > 0 ? "↑" : item.variacao < 0 ? "↓" : "→";
                      const varColor = item.variacao === 0 ? "#5a7aa0" : isPositive ? "#34d399" : "#ef4444";
                      return (
                        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#0d1525", borderRadius: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 600 }}>{item.label}</div>
                          </div>
                          <div style={{ textAlign: "center", minWidth: 50 }}>
                            <div style={{ fontSize: 8, color: "#5a7aa0" }}>{mesAntNome.split(" ")[0]}</div>
                            <div className="m" style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{item.anterior}</div>
                          </div>
                          <div style={{ fontSize: 16, color: varColor, fontWeight: 800 }}>{arrow}</div>
                          <div style={{ textAlign: "center", minWidth: 50 }}>
                            <div style={{ fontSize: 8, color: "#5a7aa0" }}>{mesAtualNome.split(" ")[0]}</div>
                            <div className="m" style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{item.atual}</div>
                          </div>
                          <div style={{ minWidth: 45, textAlign: "right" }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: varColor }}>{item.variacao > 0 ? "+" : ""}{item.variacao}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Radar Chart */}
            {radarEquipes.length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 4, marginBottom: 4 }}>Comparativo de Desempenho (Top 6)</div>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e2d48" />
                    <PolarAngleAxis dataKey="criterio" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} />
                    {radarEquipes.map((eq, i) => (
                      <Radar key={eq.id} name={eq.enc} dataKey={eq.enc} stroke={RADAR_COLORS[i]} fill={RADAR_COLORS[i]} fillOpacity={0.08} strokeWidth={2} dot={{ r: 3, fill: RADAR_COLORS[i] }} />
                    ))}
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 700, marginBottom: 4 }}>{label}</div>{payload.map((p, i) => <div key={i} style={{ fontSize: 10, color: p.stroke }}>{p.name}: {p.value}%</div>)}</div> : null} />
                  </RadarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "0 4px" }}>
                  {radarEquipes.map((eq, i) => (
                    <span key={eq.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: RADAR_COLORS[i], flexShrink: 0 }}></span>
                      {eq.enc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Gráfico barras - Score geral */}
            {eqStats.filter(e => e.diasTrab > 0).length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Score Geral por Equipe</div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={eqStats.filter(e => e.diasTrab > 0)} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                    <XAxis dataKey="enc" tick={{ fill: "#5a7aa0", fontSize: 9 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} angle={-35} textAnchor="end" height={50} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700 }}>{payload[0]?.payload?.nome} - {payload[0]?.payload?.enc}</div><div style={{ fontSize: 11, color: scoreCol(payload[0]?.value) }}>Score: {payload[0]?.value}/100</div><div style={{ fontSize: 9, color: "#5a7aa0", marginTop: 4 }}>Conclusão: {payload[0]?.payload?.txConclusao}%</div><div style={{ fontSize: 9, color: "#5a7aa0" }}>Produtiv.: {payload[0]?.payload?.txProdutividade}%</div><div style={{ fontSize: 9, color: "#5a7aa0" }}>Qualidade: {payload[0]?.payload?.txQualidade}%</div></div> : null} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={16}>
                      {eqStats.filter(e => e.diasTrab > 0).map((e, i) => <Cell key={i} fill={scoreCol(e.score)} />)}
                    </Bar>
                    <Line type="monotone" dataKey={() => avgScore} name="Média" stroke="#3b9eff" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Indicadores por equipe */}
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Detalhamento por Equipe</div>
            {eqStats.map((eq, i) => (
              <details key={eq.id} style={{ marginBottom: 4 }}>
                <summary style={{ background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, listStyle: "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: scoreCol(eq.score) + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="m" style={{ fontSize: 11, fontWeight: 800, color: scoreCol(eq.score) }}>{eq.score}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{eq.nome} - {eq.enc} <span style={{ fontSize: 9, color: tipoCor(eq.tipo) }}>{eq.tipo}</span></div>
                    <div style={{ fontSize: 9, color: "#5a7aa0" }}>{eq.diasTrab} dia(s) · {fUS(eq.mesUS)} US · {eq.totalRetrab} retrab.</div>
                  </div>
                  <span style={{ fontSize: 10, color: "#5a7aa0" }}>▶</span>
                </summary>
                <div style={{ background: "#0d1829", borderRadius: "0 0 10px 10px", padding: "10px 12px", border: "1px solid #1e2d48", borderTop: "none" }}>
                  {/* 4 indicadores */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                    <div style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Taxa Conclusão</div>
                      <div className="m" style={{ fontSize: 20, fontWeight: 800, color: pctCol(eq.txConclusao) }}>{eq.txConclusao}%</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>{eq.ptsConcl}/{eq.ptsProg} pontos</div>
                    </div>
                    <div style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Produtividade</div>
                      <div className="m" style={{ fontSize: 20, fontWeight: 800, color: pctCol(eq.txProdutividade) }}>{eq.txProdutividade}%</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>{fUS(eq.mesUS)}/{eq.metaMes} US</div>
                    </div>
                    <div style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Qualidade</div>
                      <div className="m" style={{ fontSize: 20, fontWeight: 800, color: pctCol(eq.txQualidade) }}>{eq.txQualidade}%</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>{eq.totalRetrab} retrabalho(s)</div>
                    </div>
                    <div style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Média Diária</div>
                      <div className="m" style={{ fontSize: 20, fontWeight: 800, color: pctCol(eq.txMeta) }}>{fUS(eq.mediaDia)}</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>meta: {eq.meta} US/dia</div>
                    </div>
                  </div>
                  {/* Mini progress bars */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {[
                      { label: "Conclusão", value: eq.txConclusao, color: "#34d399" },
                      { label: "Produtividade", value: eq.txProdutividade, color: "#3b9eff" },
                      { label: "Qualidade", value: eq.txQualidade, color: "#a78bfa" },
                      { label: "Meta", value: eq.txMeta, color: "#facc15" },
                    ].map(b => (
                      <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 8, color: "#5a7aa0", width: 55, textAlign: "right" }}>{b.label}</span>
                        <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.05)", borderRadius: 6 }}>
                          <div style={{ height: "100%", width: Math.min(b.value, 100) + "%", background: b.color, borderRadius: 6, transition: "width .3s" }} />
                        </div>
                        <span className="m" style={{ fontSize: 9, color: b.color, fontWeight: 700, width: 30 }}>{b.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}

            {/* Legenda */}
            <div style={{ marginTop: 14, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48" }}>
              <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Como o Score é calculado</div>
              <div style={{ fontSize: 9, color: "#5a7aa0", lineHeight: 1.6 }}>
                Conclusão (25%) + Produtividade (30%) + Qualidade (25%) + Meta Diária (20%)
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 9, color: "#34d399" }}>● 80+ Excelente</span>
                <span style={{ fontSize: 9, color: "#facc15" }}>● 60-79 Bom</span>
                <span style={{ fontSize: 9, color: "#f97316" }}>● 40-59 Regular</span>
                <span style={{ fontSize: 9, color: "#ef4444" }}>● 0-39 Crítico</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ DETALHE ═══ */}
      {screen === "detalhe" && selEq && (() => {
        const eq = EQUIPES.find(e => e.id === selEq[0]?.eqId);
        const allA = atribs.filter(a => a.data === dataSel && a.eqId === selEq[0]?.eqId);
        const t = getTotals(allA);
        return (
          <div style={{ padding: "14px 14px 100px" }}>
            <button onClick={() => { setSelEq(null); setScreen("home"); }} style={bk}>← Voltar</button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div><h2 style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9" }}>{eqLabel(eq)}</h2><span style={{ fontSize: 10, color: tipoCor(eq.tipo), fontWeight: 700 }}>{eq.tipo} · Meta: {eq.meta} US/dia</span></div>
              <div style={{ textAlign: "right" }}><div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#22c55e" }}>{fUS(t.realUS)} US</div><div className="m" style={{ fontSize: 10, color: "#4b6080" }}>prev: {fUS(t.prevUS)} US</div></div>
            </div>

            {allA.map(atrib => {
              const aKey = atrib._fbKey || atrib.id;
              const nota = notas.find(n => n.id === atrib.notaId); const pts = getPts(atrib.notaId, atrib.pIds); const st = atrib.status || {};
              return (
                <div key={aKey} style={{ background: "#111d33", borderRadius: 12, padding: 12, marginBottom: 10, border: "1px solid #1e2d48" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 8, wordBreak: "break-all" }}>{nota?.nome}</div>
                  {pts.map(pt => { const s = st[pt.id] || "pending"; const ptCava = cavas.find(c => c.atribId === aKey && c.pontoId === pt.id); const prepEq = ptCava ? EQUIPES.find(e => e.id === ptCava.prepEqId) : null;
                    // Calculate actual US considering unchecked services
                    const svcSt = (atrib.svcStatus || {})[pt.id] || {};
                    let ptRealU = pt.u;
                    if (s === "ok" && pt.svcs && pt.svcs.length > 0) {
                      ptRealU = pt.svcs.reduce((sum, sv) => sum + (svcSt[sv.id] === false ? 0 : sv.u), 0);
                    }
                    const hasUnchecked = pt.svcs && Object.values(svcSt).some(v => v === false);
                    return (
                    <div key={pt.id}>
                      <div onClick={() => !isGestor && togglePonto(aKey, pt.id)} style={{ background: s === "ok" ? "rgba(34,197,94,.06)" : s === "no" ? "rgba(239,68,68,.06)" : "#0b1121", borderRadius: (ptCava || (s === "ok" && pt.svcs?.length)) ? "8px 8px 0 0" : "8px", padding: "8px 10px", marginBottom: (ptCava || (s === "ok" && pt.svcs?.length)) ? 0 : 3, border: "1px solid " + (s === "ok" ? "rgba(34,197,94,.15)" : s === "no" ? "rgba(239,68,68,.15)" : "#1a2540"), display: "flex", alignItems: "center", gap: 8, cursor: isGestor ? "default" : "pointer" }}>
                        <span style={{ fontSize: 16 }}>{sI(s)}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: s === "no" ? "#ef4444" : "#d1d9e6", textDecoration: s === "no" ? "line-through" : "none" }}>{pt.n}</span>
                          {hasUnchecked && s === "ok" && <span style={{ fontSize: 9, color: "#facc15", marginLeft: 4 }}>parcial</span>}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span className="m" style={{ fontSize: 10, fontWeight: 700, color: s === "ok" ? "#34d399" : s === "no" ? "#ef4444" : "#eab308" }}>{fUS(ptCava ? ptRealU - 2 : ptRealU)} US</span>
                          {hasUnchecked && s === "ok" && <div className="m" style={{ fontSize: 8, color: "#5a7aa0", textDecoration: "line-through" }}>{fUS(pt.u)} US</div>}
                        </div>
                      </div>
                      {/* Collapsible service list */}
                      {s === "ok" && pt.svcs && pt.svcs.length > 0 && (
                        <details style={{ background: "rgba(34,197,94,.03)", borderLeft: "2px solid rgba(34,197,94,.15)", borderRight: "1px solid rgba(34,197,94,.08)", borderBottom: ptCava ? "none" : "1px solid rgba(34,197,94,.08)", borderRadius: ptCava ? 0 : "0 0 8px 8px", marginBottom: ptCava ? 0 : 3 }}>
                          <summary style={{ padding: "5px 10px", fontSize: 9, color: "#5a7aa0", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                            ▶ {pt.svcs.length} serviço(s) — toque para expandir
                            {hasUnchecked && <span style={{ color: "#facc15", marginLeft: 4 }}>({Object.values(svcSt).filter(v => v === false).length} desmarcado(s))</span>}
                          </summary>
                          <div style={{ padding: "2px 8px 6px" }}>
                            <div style={{ fontSize: 8, color: "#5a7aa0", marginBottom: 3 }}>Desmarque os serviços não executados</div>
                          {pt.svcs.map(sv => {
                            const checked = svcSt[sv.id] !== false;
                            return (
                              <div key={sv.id} onClick={(e) => {
                                e.stopPropagation();
                                if (isGestor) return;
                                const newSvcSt = { ...(atrib.svcStatus || {}) };
                                if (!newSvcSt[pt.id]) newSvcSt[pt.id] = {};
                                newSvcSt[pt.id][sv.id] = !checked;
                                fbSet(`atribs/${aKey}/svcStatus`, newSvcSt);
                              }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", cursor: isGestor ? "default" : "pointer", opacity: checked ? 1 : .5 }}>
                                <span style={{ width: 14, height: 14, borderRadius: 3, border: checked ? "1.5px solid #34d399" : "1.5px solid #ef4444", background: checked ? "#34d399" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {checked && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#0b1121" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                </span>
                                <span style={{ flex: 1, fontSize: 9, color: checked ? "#94a3b8" : "#ef4444", textDecoration: checked ? "none" : "line-through" }}>{sv.d}</span>
                                <span className="m" style={{ fontSize: 9, color: checked ? "#5a7aa0" : "#ef4444", fontWeight: 600 }}>{fUS(sv.u)}</span>
                              </div>
                            );
                          })}
                          </div>
                        </details>
                      )}
                      {ptCava && (<div style={{ background: "rgba(249,115,22,.06)", borderRadius: "0 0 8px 8px", padding: "4px 10px", marginBottom: 3, border: "1px solid rgba(249,115,22,.12)", borderTop: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, color: "#f97316" }}>🔧 Cava: -2 US → {prepEq?.nome} - {prepEq?.enc}</span>
                        {!isGestor && <button onClick={e => { e.stopPropagation(); fbRemove(`cavas/${ptCava._fbKey}`); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 10 }}>✕</button>}
                      </div>)}
                    </div>
                  ); })}

                  {(atrib.extras || []).length > 0 && (<div style={{ marginTop: 6 }}><div style={{ fontSize: 9, color: "#84cc16", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Adicionais</div>
                    {atrib.extras.map(ex => (<div key={ex.id} style={{ background: "rgba(132,204,22,.06)", borderRadius: 6, padding: "6px 10px", marginBottom: 2, border: "1px solid rgba(132,204,22,.12)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11 }}>➕</span><span style={{ flex: 1, fontSize: 10, color: "#d1d9e6" }}>{ex.desc}</span>
                      <span className="m" style={{ fontSize: 10, fontWeight: 700, color: "#84cc16" }}>{fUS(ex.valor / DIVISOR_US)} US</span>
                      {!isGestor && <button onClick={e => { e.stopPropagation(); delExtra(aKey, ex.id); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 11 }}>✕</button>}
                    </div>))}
                  </div>)}

                  {!isGestor && (addExtraFor === aKey && extraForm ? (
                    <div style={{ marginTop: 8, background: "#0b1121", borderRadius: 8, padding: 10, border: "1px solid #1e2d48" }}>
                      <select value={extraForm.svcIdx} onChange={e => { const i = Number(e.target.value); setExtraForm(f => ({ ...f, svcIdx: i, valor: i >= 0 ? SERVICOS_LISTA[i].v : 0, customDesc: i >= 0 ? SERVICOS_LISTA[i].d : "" })); }} style={{ ...inp, marginBottom: 6, fontSize: 11 }}><option value={-1}>Selecione o serviço</option>{SERVICOS_LISTA.map((s, i) => <option key={i} value={i}>{s.d} {s.v > 0 ? "(" + fUS(s.v / DIVISOR_US) + " US)" : ""}</option>)}</select>
                      {extraForm.svcIdx >= 0 && SERVICOS_LISTA[extraForm.svcIdx]?.d.includes("OUTRO") && (<>
                        <input value={extraForm.customDesc} onChange={e => setExtraForm(f => ({ ...f, customDesc: e.target.value }))} placeholder="Descrição" style={{ ...inp, marginBottom: 4, fontSize: 11 }} />
                        <input type="number" min="0" value={extraForm.valor} onChange={e => setExtraForm(f => ({ ...f, valor: e.target.value }))} placeholder="Valor R$" style={{ ...inp, marginBottom: 4, fontSize: 11 }} />
                      </>)}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setAddExtraFor(null); setExtraForm(null); }} style={{ flex: 1, padding: "7px 0", background: "#1e2d48", color: "#4b6080", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                        <button onClick={() => { if (extraForm.svcIdx < 0) return; const s = SERVICOS_LISTA[extraForm.svcIdx]; addExtra(aKey, s.d.includes("OUTRO") ? extraForm.customDesc : s.d, extraForm.valor); setAddExtraFor(null); setExtraForm(null); }} style={{ flex: 1, padding: "7px 0", background: "#84cc16", color: "#0b1121", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Adicionar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setAddExtraFor(aKey); setExtraForm({ svcIdx: -1, valor: 0, customDesc: "" }); }} style={{ width: "100%", marginTop: 6, padding: "7px 0", background: "rgba(132,204,22,.06)", color: "#84cc16", border: "1px dashed rgba(132,204,22,.2)", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+ Ponto Adicional</button>
                  ))}

                  {!isGestor && <button onClick={() => { delAtrib(aKey); const rem = allA.filter(a => (a._fbKey || a.id) !== aKey); if (!rem.length) { setSelEq(null); setScreen("home"); } else setSelEq(rem); }} style={{ width: "100%", marginTop: 6, padding: "6px 0", background: "rgba(239,68,68,.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,.12)", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Remover</button>}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ═══ RANKING (gestor) ═══ */}
      {screen === "ranking" && (
        <div style={{ padding: "12px 14px 100px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>Ranking & Metas</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <MonthNav value={histMonth} onChange={setHistMonth} style={{ flex: 1 }} />
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={{ flex: 1, ...inp }} />
          </div>
          <select value={histEq} onChange={e => setHistEq(e.target.value)} style={{ width: "100%", marginBottom: 14, ...inp }}>
            <option value="all">Todas as equipes</option>
            <option value="tipo_B3">Tipo B3</option>
            <option value="tipo_C1">Tipo C1</option>
            <option value="tipo_B1">Tipo B1</option>
            {EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}
          </select>
          {(() => {
            const filteredRanking = ranking.filter(e => {
              if (histEq === "all") return e.meta > 0;
              if (histEq.startsWith("tipo_")) return e.tipo === histEq.replace("tipo_", "") && e.meta > 0;
              return e.id === histEq && e.meta > 0;
            });
            return (<>
          <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px", marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Produção Mensal — US</span>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#34d399" }}></span>Realizado</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}><span style={{ width: 10, height: 2, borderRadius: 1, background: "#3b9eff" }}></span>Meta</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={filteredRanking} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                <XAxis dataKey="enc" tick={{ fill: "#5a7aa0", fontSize: 9 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} angle={-35} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700, marginBottom: 4 }}>{payload[0]?.payload?.nome} - {payload[0]?.payload?.enc}</div><div style={{ fontSize: 11, color: "#34d399" }}>Realizado: {fUS(payload[0]?.payload?.mesUS)} US</div><div style={{ fontSize: 11, color: "#3b9eff" }}>Meta: {payload[0]?.payload?.metaMes} US</div><div style={{ fontSize: 11, color: pctCol(payload[0]?.payload?.pctMes) }}>{payload[0]?.payload?.pctMes}%</div></div> : null} />
                <Bar dataKey="mesUS" name="Realizado" radius={[4, 4, 0, 0]} barSize={18}>
                  {filteredRanking.map((e, i) => <Cell key={i} fill={pctCol(e.pctMes)} />)}
                </Bar>
                <Line type="monotone" dataKey="metaMes" name="Meta" stroke="#3b9eff" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 10, color: "#4b6080", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Detalhamento</div>
          {filteredRanking.map((eq, i) => (<div key={eq.id} style={{ background: "#111d33", borderRadius: 10, padding: "10px 12px", marginBottom: 4, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 12, background: i < 3 && eq.mesUS > 0 ? ["#eab308", "#94a3b8", "#cd7f32"][i] + "22" : "#1e2d48", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: i < 3 && eq.mesUS > 0 ? ["#eab308", "#d1d5db", "#cd7f32"][i] : "#4b6080" }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{eq.nome} - {eq.enc} <span style={{ fontSize: 9, color: tipoCor(eq.tipo) }}>{eq.tipo}</span></div>
              <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#4b6080", marginTop: 2 }}>
                <span>Dia: <strong style={{ color: pctCol(eq.pctDia) }}>{fUS(eq.diaUS)}/{eq.meta}</strong></span>
                <span>Mês: <strong style={{ color: pctCol(eq.pctMes) }}>{fUS(eq.mesUS)}/{eq.metaMes}</strong></span>
                <span>Média: <strong style={{ color: "#a78bfa" }}>{fUS(mesDiasComDados > 0 ? getEqMonthUS(eq.id, histMonth) / mesDiasComDados : 0)}/dia</strong></span>
              </div>
              {eq.meta > 0 && <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,.05)", borderRadius: 4 }}><div style={{ height: "100%", width: Math.min(eq.pctMes, 100) + "%", background: pctCol(eq.pctMes), borderRadius: 4 }} /></div>}
            </div>
            <div className="m" style={{ fontSize: 14, fontWeight: 800, color: pctCol(eq.pctMes), flexShrink: 0 }}>{eq.pctMes}%</div>
          </div>))}
          </>);
          })()}
        </div>
      )}

      {/* ═══ HISTÓRICO (gestor) ═══ */}
      {screen === "historico" && (
        <div style={{ padding: "12px 14px 100px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>Histórico (US)</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <MonthNav value={histMonth} onChange={setHistMonth} style={{ flex: 1 }} />
            <select value={histEq} onChange={e => setHistEq(e.target.value)} style={{ flex: 1, ...inp }}><option value="all">Todas</option>{EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}</select>
          </div>
          <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 16, padding: "0 8px", marginBottom: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(52,211,153,.3)" }}></span>Realizado</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8" }}><span style={{ width: 10, height: 3, borderRadius: 1, background: "#3b9eff", display: "inline-block" }}></span>Meta</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={histData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Dia {label}</div>{payload.map((p, i) => <div key={i} style={{ fontSize: 11, color: p.stroke || p.fill || p.color, fontWeight: 600 }}>{p.name}: {fUS(p.value)} US</div>)}</div> : null} />
                <Area type="monotone" dataKey="realUS" name="Realizado" stroke="#34d399" strokeWidth={2.5} fill="url(#gradReal)" dot={false} />
                <Line type="monotone" dataKey="prevUS" name="Meta" stroke="#3b9eff" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ═══ RETRABALHO ═══ */}
      {screen === "retrabalho" && !retForm && (() => {
        const [retFilterEq, setRetFilterEq] = [histEq, setHistEq];
        const rAll = retrab.filter(r => r.data?.startsWith(histMonth));
        const rM = retFilterEq === "all" ? rAll : rAll.filter(r => r.eqId === retFilterEq);
        const totalM = rM.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
        const mC = {}; rM.forEach(r => { const m = r.motivo || "?"; mC[m] = (mC[m] || 0) + (Number(r.qtd) || 1); });
        const mS = Object.entries(mC).sort((a, b) => b[1] - a[1]); const mMax = mS.length > 0 ? mS[0][1] : 1;
        const notasAfetadas = new Set(rM.map(r => r.notaId).filter(Boolean));
        const pontosAfetados = new Set(rM.map(r => r.pontoNome).filter(Boolean));
        const eqsAfetadas = new Set(rM.map(r => r.eqId));

        const eR = EQUIPES.map(eq => {
          const eqR = rM.filter(r => r.eqId === eq.id);
          const total = eqR.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
          const eqMotivos = {}; eqR.forEach(r => { eqMotivos[r.motivo] = (eqMotivos[r.motivo] || 0) + (Number(r.qtd) || 1); });
          const topMotivo = Object.entries(eqMotivos).sort((a, b) => b[1] - a[1]);
          const eqNotas = new Set(eqR.map(r => r.notaId).filter(Boolean));
          return { ...eq, total, topMotivo, notasCount: eqNotas.size, registros: eqR.length };
        }).sort((a, b) => b.total - a.total);
        const eRChart = eR.filter(e => e.total > 0);

        // Supervisor retrabalhos
        const supR = rM.filter(r => r.eqId === "supervisor");
        const supTotal = supR.reduce((s, r) => s + (Number(r.qtd) || 1), 0);

        // Daily chart data
        const [cy, cm] = histMonth.split("-").map(Number); const dInM = new Date(cy, cm, 0).getDate();
        const dailyData = []; for (let d = 1; d <= dInM; d++) { const ds = histMonth + "-" + String(d).padStart(2, "0"); dailyData.push({ dia: d, qtd: rM.filter(r => r.data === ds).reduce((s, r) => s + (Number(r.qtd) || 1), 0) }); }

        const DONUT_COLORS = ["#ef4444","#f97316","#facc15","#a78bfa","#3b9eff","#34d399","#f472b6","#fb923c","#6ee7b7","#818cf8","#94a3b8","#fbbf24","#e879f9","#22d3ee","#f43f5e","#84cc16","#fb7185"];
        const donutData = mS.map(([name, value]) => ({ name, value }));

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9" }}>📊 Retrabalho</h2>
              {!isGestor && <button onClick={() => setRetForm({ eqId: "", data: dataSel, notaId: "", items: [], obs: "", supervisor: "" })} style={{ padding: "7px 14px", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>+ Registrar</button>}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <MonthNav value={histMonth} onChange={setHistMonth} style={{ flex: 1 }} />
              <select value={retFilterEq} onChange={e => setRetFilterEq(e.target.value)} style={{ flex: 1, ...inp }}>
                <option value="all">Todas equipes</option>
                {EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}
                <option value="supervisor">Supervisor</option>
              </select>
            </div>

            {/* Summary cards - 2 rows */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #ef4444" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Total Retrab.</div>
                <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{totalM}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #f97316" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Equipes</div>
                <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#f97316" }}>{eqsAfetadas.size}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #facc15" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Notas afetadas</div>
                <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#facc15" }}>{notasAfetadas.size}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Pontos afetados</div>
                <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#3b9eff" }}>{pontosAfetados.size}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Tipos motivo</div>
                <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#a78bfa" }}>{mS.length}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Supervisor</div>
                <div className="m" style={{ fontSize: 18, fontWeight: 800, color: supTotal > 0 ? "#e879f9" : "#2d3d56" }}>{supTotal}</div>
              </div>
            </div>

            {/* Gráfico evolução diária - área */}
            {totalM > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Evolução Diária de Retrabalhos</div>
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={dailyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRetrab" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                    <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Dia {label}</div><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>{payload[0].value} retrabalho(s)</div></div> : null} />
                    <Area type="monotone" dataKey="qtd" stroke="#ef4444" strokeWidth={2} fill="url(#gradRetrab)" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Gráfico barras por equipe + linha média */}
            {eRChart.length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Retrabalhos por Equipe</div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={eRChart} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                    <XAxis dataKey="enc" tick={{ fill: "#5a7aa0", fontSize: 9 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} angle={-35} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700 }}>{payload[0]?.payload?.nome} - {payload[0]?.payload?.enc}</div><div style={{ fontSize: 11, color: "#ef4444" }}>{payload[0]?.value} retrabalho(s)</div><div style={{ fontSize: 10, color: "#5a7aa0" }}>{payload[0]?.payload?.notasCount} nota(s) afetada(s)</div></div> : null} />
                    <Bar dataKey="total" name="Retrabalhos" radius={[4, 4, 0, 0]} barSize={16}>
                      {eRChart.map((e, i) => <Cell key={i} fill={i === 0 ? "#ef4444" : i === 1 ? "#f97316" : i === 2 ? "#fb923c" : "#fbbf24"} />)}
                    </Bar>
                    <Line type="monotone" dataKey={() => totalM > 0 ? Math.round(totalM / Math.max(eRChart.length, 1) * 10) / 10 : 0} name="Média" stroke="#3b9eff" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Donut de motivos */}
            {donutData.length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 4, marginBottom: 6 }}>Distribuição por Motivo</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" stroke="none">
                      {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 600 }}>{payload[0]?.name}</div><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>{payload[0]?.value} ({totalM > 0 ? Math.round(payload[0]?.value / totalM * 100) : 0}%)</div></div> : null} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "0 4px" }}>
                  {donutData.map((d, i) => (
                    <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }}></span>
                      {d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Barras de motivos */}
            {mS.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Detalhamento por Motivo</div>
                {mS.map(([m, c]) => (<div key={m} style={{ background: "#111d33", borderRadius: 6, padding: "6px 10px", marginBottom: 3, border: "1px solid #1e2d48" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ fontSize: 11, color: "#e2e8f0" }}>{m}</span><span className="m" style={{ fontSize: 11, fontWeight: 800, color: "#ef4444" }}>{c} <span style={{ color: "#5a7aa0", fontWeight: 400 }}>({totalM > 0 ? Math.round(c / totalM * 100) : 0}%)</span></span></div><div style={{ height: 4, background: "rgba(255,255,255,.05)", borderRadius: 4 }}><div style={{ height: "100%", width: (c / mMax * 100) + "%", background: "linear-gradient(90deg, #ef4444, #f97316)", borderRadius: 4 }} /></div></div>))}
              </div>
            )}

            {/* Ranking detalhado por equipe */}
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Ranking Detalhado por Equipe</div>
            {eR.map((eq, i) => (
              <div key={eq.id} style={{ background: "#111d33", borderRadius: 10, padding: "10px 12px", marginBottom: 4, border: eq.total > 0 ? "1px solid rgba(239,68,68,.15)" : "1px solid #1e2d48", opacity: eq.total === 0 ? .3 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: eq.total > 0 ? 6 : 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: eq.total > 0 && i < 3 ? ["#ef4444", "#f97316", "#fb923c"][i] + "22" : "#1e2d48", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: eq.total > 0 && i < 3 ? ["#ef4444", "#f97316", "#fb923c"][i] : "#4b6080" }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{eq.nome} - {eq.enc}</div>
                    {eq.total > 0 && <div style={{ fontSize: 9, color: "#5a7aa0" }}>{eq.notasCount} nota(s) · {eq.registros} registro(s)</div>}
                  </div>
                  <div className="m" style={{ fontSize: 16, fontWeight: 800, color: eq.total > 0 ? "#ef4444" : "#2d3d56" }}>{eq.total}</div>
                </div>
                {eq.total > 0 && eq.topMotivo.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                    {eq.topMotivo.slice(0, 4).map(([m, c]) => (
                      <span key={m} style={{ fontSize: 8, padding: "2px 6px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.12)", borderRadius: 4, color: "#fb923c" }}>{m}: {c}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Supervisor section */}
            {supTotal > 0 && (
              <div style={{ marginTop: 10, background: "rgba(232,121,249,.06)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(232,121,249,.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e879f9" }}>Supervisor</div>
                    <div style={{ fontSize: 9, color: "#5a7aa0" }}>{supR.length} registro(s)</div>
                  </div>
                  <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#e879f9" }}>{supTotal}</div>
                </div>
              </div>
            )}

            {/* Pesquisa e lista de registros */}
            {rM.length > 0 && (() => {
              const [retSearch, setRetSearch] = [histEq === "retSearch" ? "" : (retForm?.search || ""), (v) => {}];
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Registros do Mês ({rM.length})</div>
                  <input value={retForm?.search || ""} onChange={e => setRetForm(f => f ? { ...f, search: e.target.value } : { search: e.target.value })} placeholder="🔍 Pesquisar por nota, equipe, motivo..." style={{ ...inp, marginBottom: 8, fontSize: 11 }} />
                  {(() => {
                    const searchTerm = (retForm?.search || "").toLowerCase();
                    const filtered = rM.filter(r => {
                      if (!searchTerm) return true;
                      const eq = EQUIPES.find(e => e.id === r.eqId);
                      const nt = notas.find(n => n.id === r.notaId);
                      const text = [eq?.nome, eq?.enc, r.eqId === "supervisor" ? "supervisor" : "", nt?.nome, r.pontoNome, r.motivo, r.obs].filter(Boolean).join(" ").toLowerCase();
                      return text.includes(searchTerm);
                    }).sort((a, b) => (b.data || "").localeCompare(a.data || ""));

                    if (searchTerm && filtered.length === 0) return <div style={{ padding: 12, textAlign: "center", fontSize: 11, color: "#5a7aa0" }}>Nenhum registro encontrado para "{searchTerm}"</div>;

                    // Group by nota to show count
                    const notaCounts = {};
                    filtered.forEach(r => {
                      const nt = notas.find(n => n.id === r.notaId);
                      const key = nt?.nome || "Sem nota";
                      notaCounts[key] = (notaCounts[key] || 0) + (Number(r.qtd) || 1);
                    });

                    return (
                      <>
                        {searchTerm && (
                          <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {Object.entries(notaCounts).map(([nota, count]) => (
                              <span key={nota} style={{ fontSize: 9, padding: "3px 8px", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.12)", borderRadius: 6, color: "#fb923c" }}>{nota}: {count}x</span>
                            ))}
                          </div>
                        )}
                        {filtered.map(r => {
                          const eq = EQUIPES.find(e => e.id === r.eqId);
                          const eqDisplay = r.eqId === "supervisor" ? "Supervisor" : (eq ? eq.nome + " - " + eq.enc : "?");
                          const nt = notas.find(n => n.id === r.notaId);
                          const rKey = r._fbKey;
                          return (
                            <div key={rKey || r.id} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
                                  {eqDisplay} <span style={{ color: "#5a7aa0", fontSize: 9 }}>· {(r.data || "").split("-").reverse().join("/")}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#f97316", fontWeight: 600 }}>{r.motivo}</div>
                                {r.pontoNome && <div style={{ fontSize: 9, color: "#3b9eff" }}>Ponto: {r.pontoNome}</div>}
                                {nt && <div style={{ fontSize: 9, color: "#5a7aa0" }}>Nota: {nt.nome}</div>}
                                {r.obs && <div style={{ fontSize: 9, color: "#5a7aa0", fontStyle: "italic" }}>{r.obs}</div>}
                              </div>
                              <div className="m" style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", flexShrink: 0 }}>{r.qtd}x</div>
                              <button onClick={() => { if (rKey) fbRemove(bp+"/retrab/" + rKey); }} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 11, padding: "4px 8px", fontWeight: 700 }}>✕</button>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {screen === "retrabalho" && retForm && (() => {
        const retNota = retForm.notaId ? notas.find(n => n.id === retForm.notaId) : null;
        const retItems = retForm.items || [];
        
        // Find which equipe executed a ponto in this nota
        const findEqForPonto = (notaId, pontoNome) => {
          if (!notaId || !pontoNome) return null;
          const nota = notas.find(n => n.id === notaId);
          if (!nota) return null;
          const ponto = (nota.pontos || []).find(p => p.n === pontoNome);
          if (!ponto) return null;
          // Search all atribs for this ponto by ID
          for (const a of atribs) {
            if (a.notaId !== notaId) continue;
            if (!(a.pIds || []).includes(ponto.id)) continue;
            const eq = EQUIPES.find(e => e.id === a.eqId);
            if (eq) return eq;
          }
          // Fallback: search by nota name + ponto name across all atribs
          for (const a of atribs) {
            const aNota = notas.find(n => n.id === a.notaId);
            if (!aNota || aNota.nome !== nota.nome) continue;
            const aPontos = (aNota.pontos || []).filter(p => (a.pIds || []).includes(p.id));
            if (aPontos.some(p => p.n === pontoNome)) {
              const eq = EQUIPES.find(e => e.id === a.eqId);
              if (eq) return eq;
            }
          }
          return null;
        };
        
        const addRetItem = (pontoNome) => {
          if (retItems.find(i => i.pontoNome === pontoNome)) return;
          // Auto-detect equipe
          const detectedEq = findEqForPonto(retForm.notaId, pontoNome);
          setRetForm(f => {
            const newItems = [...(f.items || []), { pontoNome, motivos: [], qtd: 1, detectedEqId: detectedEq?.id || "" }];
            // If equipe field is empty and we detected one, auto-fill
            const newEqId = !f.eqId && detectedEq ? detectedEq.id : f.eqId;
            return { ...f, items: newItems, eqId: newEqId };
          });
        };
        const removeRetItem = (pontoNome) => {
          setRetForm(f => ({ ...f, items: (f.items || []).filter(i => i.pontoNome !== pontoNome) }));
        };
        const toggleRetMotivo = (pontoNome, motivo) => {
          setRetForm(f => ({ ...f, items: (f.items || []).map(i => {
            if (i.pontoNome !== pontoNome) return i;
            const has = (i.motivos || []).includes(motivo);
            return { ...i, motivos: has ? i.motivos.filter(m => m !== motivo) : [...(i.motivos || []), motivo] };
          })}));
        };
        const updateRetItem = (pontoNome, field, value) => {
          setRetForm(f => ({ ...f, items: (f.items || []).map(i => i.pontoNome === pontoNome ? { ...i, [field]: value } : i) }));
        };
        const canSave = retForm.eqId && retForm.notaId && retItems.length > 0 && retItems.every(i => (i.motivos || []).length > 0);
        return (
          <div style={{ padding: "14px 14px 100px" }}>
            <button onClick={() => setRetForm(null)} style={bk}>← Voltar</button>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 14 }}>Registrar Retrabalho</h2>
            <FL label="Equipe"><select value={retForm.eqId} onChange={e => setRetForm(f => ({ ...f, eqId: e.target.value }))} style={inp}><option value="">Selecione</option>{EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}<option value="supervisor">Supervisor</option></select></FL>
            <FL label="Data"><input type="date" value={retForm.data} onChange={e => setRetForm(f => ({ ...f, data: e.target.value }))} style={inp} /></FL>
            <FL label="Nota / Obra">
              <input value={retNotaBusca} onChange={e => { setRetNotaBusca(e.target.value); setRetForm(f => ({ ...f, notaId: "", items: [] })); }} placeholder="🔍 Pesquisar nota..." style={inp} />
              {retNotaBusca.length > 0 && !retForm.notaId && (
                <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  {notas.filter(n => n.nome.toLowerCase().includes(retNotaBusca.toLowerCase())).map(n => (
                    <button key={n.id} onClick={() => { setRetForm(f => ({ ...f, notaId: n.id, items: [] })); setRetNotaBusca(n.nome); }} style={{ padding: "8px 10px", background: "#111d33", border: "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 11, color: "#d4dce9" }}>{n.nome}</button>
                  ))}
                  {notas.filter(n => n.nome.toLowerCase().includes(retNotaBusca.toLowerCase())).length === 0 && (
                    <div style={{ padding: 10, fontSize: 11, color: "#4b6080", textAlign: "center" }}>Nenhuma nota encontrada</div>
                  )}
                </div>
              )}
              {retForm.notaId && (
                <div style={{ marginTop: 4, padding: "6px 10px", background: "rgba(96,165,250,.08)", borderRadius: 6, border: "1px solid rgba(96,165,250,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>{notas.find(n => n.id === retForm.notaId)?.nome}</span>
                  <button onClick={() => { setRetForm(f => ({ ...f, notaId: "", items: [] })); setRetNotaBusca(""); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              )}
            </FL>

            {/* Alerta de reincidência */}
            {retNota && (() => {
              const allRetrabForNota = retrab.filter(r => {
                const nt = notas.find(n => n.id === r.notaId);
                return nt && nt.nome === retNota.nome;
              });
              if (allRetrabForNota.length === 0) return null;
              
              // Group by ponto
              const pontoRetrab = {};
              allRetrabForNota.forEach(r => {
                const key = r.pontoNome || "Geral";
                if (!pontoRetrab[key]) pontoRetrab[key] = { count: 0, motivos: new Set(), datas: new Set() };
                pontoRetrab[key].count += Number(r.qtd) || 1;
                pontoRetrab[key].motivos.add(r.motivo);
                pontoRetrab[key].datas.add(r.data);
              });
              
              const totalPrev = allRetrabForNota.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
              const isReincidente = totalPrev >= 2;
              
              return (
                <div style={{ background: isReincidente ? "rgba(239,68,68,.1)" : "rgba(249,115,22,.06)", border: isReincidente ? "1.5px solid rgba(239,68,68,.3)" : "1px solid rgba(249,115,22,.15)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isReincidente ? "#ef4444" : "#f97316", marginBottom: 4 }}>
                    {isReincidente ? "🔴 REINCIDÊNCIA!" : "⚠️ Nota com retrabalho anterior"}
                     — esta nota já tem {totalPrev} retrabalho(s) registrado(s)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {Object.entries(pontoRetrab).map(([ponto, info]) => (
                      <div key={ponto} style={{ fontSize: 9, color: "#5a7aa0", display: "flex", gap: 6 }}>
                        <span style={{ color: "#fb923c", fontWeight: 700 }}>{ponto}:</span>
                        <span>{info.count}x — {[...info.motivos].join(", ")}</span>
                        <span style={{ color: "#3a5070" }}>({[...info.datas].map(d => (d || "").split("-").reverse().join("/")).join(", ")})</span>
                      </div>
                    ))}
                  </div>
                  {isReincidente && <div style={{ marginTop: 6, fontSize: 10, color: "#ef4444", fontWeight: 700 }}>⚠️ Confirme que este é um NOVO retrabalho e não um lançamento duplicado</div>}
                </div>
              );
            })()}

            {/* Selecionar pontos */}
            {retNota && (
              <FL label={`Selecione os pontos com retrabalho (${retItems.length} selecionado(s))`}>
                <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                  {(retNota.pontos || []).map(p => {
                    const selected = retItems.find(i => i.pontoNome === p.n);
                    const detEq = findEqForPonto(retForm.notaId, p.n);
                    // Check if this ponto already has retrabalho
                    const pontoRetCount = retrab.filter(r => {
                      const nt = notas.find(n => n.id === r.notaId);
                      return nt && nt.nome === retNota.nome && r.pontoNome === p.n;
                    }).reduce((s, r) => s + (Number(r.qtd) || 1), 0);
                    return (
                      <div key={p.id} onClick={() => selected ? removeRetItem(p.n) : addRetItem(p.n)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: selected ? "rgba(239,68,68,.06)" : pontoRetCount > 0 ? "rgba(249,115,22,.04)" : "#111d33", border: selected ? "1.5px solid rgba(239,68,68,.2)" : pontoRetCount > 0 ? "1px solid rgba(249,115,22,.15)" : "1px solid #1e2d48", borderRadius: 8, cursor: "pointer" }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: selected ? "2px solid #ef4444" : "1.5px solid #3d4d66", background: selected ? "#ef4444" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                          {selected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#d1d9e6" }}>{p.n}</span>
                          {detEq && <span style={{ fontSize: 8, color: "#3b9eff", marginLeft: 6 }}>→ {detEq.enc}</span>}
                          {pontoRetCount > 0 && <span style={{ fontSize: 8, color: "#ef4444", marginLeft: 6, fontWeight: 700 }}>🔴 {pontoRetCount}x retrab.</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FL>
            )}

            {/* Motivo para cada ponto selecionado */}
            {retItems.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#5a7aa0", textTransform: "uppercase", marginBottom: 8 }}>Motivo de cada ponto</div>
                {retItems.map(item => (
                  <div key={item.pontoNome} style={{ background: "#111d33", borderRadius: 10, padding: 10, marginBottom: 6, border: "1px solid #1e2d48" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{item.pontoNome}</span>
                        {(() => { const dEq = findEqForPonto(retForm.notaId, item.pontoNome); return dEq ? <span style={{ fontSize: 9, color: "#3b9eff", marginLeft: 6 }}>Executado por: {dEq.enc} ({dEq.nome})</span> : null; })()}
                      </div>
                      <input type="number" min="1" value={item.qtd} onChange={e => updateRetItem(item.pontoNome, "qtd", parseInt(e.target.value) || 1)}
                        style={{ width: 50, padding: "4px 6px", background: "#0b1121", border: "1px solid #1e2d48", borderRadius: 6, color: "#d4dce9", fontSize: 12, textAlign: "center" }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {MOTIVOS_RETRAB.map(m => {
                        const sel = (item.motivos || []).includes(m);
                        return (
                        <button key={m} onClick={() => toggleRetMotivo(item.pontoNome, m)}
                          style={{ padding: "5px 8px", background: sel ? "rgba(239,68,68,.15)" : "#0b1121", border: sel ? "1.5px solid rgba(239,68,68,.3)" : "1px solid #1e2d48", borderRadius: 6, cursor: "pointer", fontSize: 9, fontWeight: sel ? 700 : 500, color: sel ? "#ef4444" : "#5a7aa0" }}>{sel ? "✓ " : ""}{m}</button>
                      );})}
                    </div>
                    {(item.motivos || []).length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 9, color: "#ef4444" }}>{(item.motivos || []).length} motivo(s) selecionado(s)</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <FL label="Observação geral"><input value={retForm.obs || ""} onChange={e => setRetForm(f => ({ ...f, obs: e.target.value }))} placeholder="Detalhes..." style={inp} /></FL>
            <button onClick={() => {
              if (!canSave) return;
              retItems.forEach(item => {
                (item.motivos || []).forEach(motivo => {
                  fbPush(bp+"/retrab", { eqId: retForm.eqId, data: retForm.data, notaId: retForm.notaId, pontoNome: item.pontoNome, qtd: item.qtd, motivo, supervisor: retForm.supervisor || "", obs: retForm.obs || "" });
                });
              });
              setRetForm(null);
            }} disabled={!canSave} style={{ width: "100%", padding: "13px 0", marginTop: 8, background: !canSave ? "#1e2d48" : "linear-gradient(135deg,#ef4444,#dc2626)", color: !canSave ? "#3d4d66" : "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Registrar {retItems.reduce((s, i) => s + (i.motivos || []).length, 0)} retrabalho(s)</button>
          </div>
        );
      })()}

      {/* ═══ INSPEÇÕES (gestor) ═══ */}
      {screen === "inspecoes" && !inspecaoForm && (() => {
        const iM = inspecoes.filter(i => i.data?.startsWith(histMonth));
        const totalInsp = iM.length;
        const pontuadas = iM.filter(i => (Number(i.comportamento) < 100) || (Number(i.condicao) < 100)).length;
        const mediaComp = totalInsp > 0 ? Math.round(iM.reduce((s, i) => s + (Number(i.comportamento) || 0), 0) / totalInsp * 10) / 10 : 0;
        const mediaCond = totalInsp > 0 ? Math.round(iM.reduce((s, i) => s + (Number(i.condicao) || 0), 0) / totalInsp * 10) / 10 : 0;
        
        const eqInsp = EQUIPES.map(eq => {
          const eqI = iM.filter(i => i.eqId === eq.id);
          const total = eqI.length;
          const pont = eqI.filter(i => (Number(i.comportamento) < 100) || (Number(i.condicao) < 100)).length;
          const avgComp = total > 0 ? Math.round(eqI.reduce((s, i) => s + (Number(i.comportamento) || 0), 0) / total * 10) / 10 : 0;
          const avgCond = total > 0 ? Math.round(eqI.reduce((s, i) => s + (Number(i.condicao) || 0), 0) / total * 10) / 10 : 0;
          return { ...eq, total, pont, avgComp, avgCond };
        }).sort((a, b) => b.total - a.total);

        // Chart data - inspected teams
        const chartData = eqInsp.filter(e => e.total > 0).map(e => ({
          nome: e.enc,
          comportamento: e.avgComp,
          condicao: e.avgCond,
        }));

        // Donut data
        const conformes = totalInsp - pontuadas;
        const donutData = [
          { name: "100% Conforme", value: conformes },
          { name: "Pontuadas", value: pontuadas },
        ];
        const DONUT_COLS = ["#34d399", "#ef4444"];

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9" }}>🛡️ Inspeções de Segurança</h2>
              <button onClick={() => setInspecaoForm({ eqId: "", data: dataSel, comportamento: "", condicao: "", obs: "" })} style={{ padding: "7px 14px", background: "linear-gradient(135deg,#3b9eff,#2563eb)", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>+ Registrar</button>
            </div>
            <MonthNav value={histMonth} onChange={setHistMonth} style={{ width: "100%", marginBottom: 12 }} />

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Inspeções</div>
                <div className="m" style={{ fontSize: 20, fontWeight: 800, color: "#3b9eff" }}>{totalInsp}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Pontuadas</div>
                <div className="m" style={{ fontSize: 20, fontWeight: 800, color: "#ef4444" }}>{pontuadas}</div>
              </div>
              <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Equipes insp.</div>
                <div className="m" style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{eqInsp.filter(e => e.total > 0).length}/{EQUIPES.length}</div>
              </div>
            </div>

            {/* Médias */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48" }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Média Comportamento</div>
                <div className="m" style={{ fontSize: 22, fontWeight: 800, color: mediaComp >= 100 ? "#34d399" : mediaComp >= 90 ? "#facc15" : "#ef4444" }}>{mediaComp}%</div>
              </div>
              <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48" }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Média Condição</div>
                <div className="m" style={{ fontSize: 22, fontWeight: 800, color: mediaCond >= 100 ? "#34d399" : mediaCond >= 90 ? "#facc15" : "#ef4444" }}>{mediaCond}%</div>
              </div>
            </div>

            {/* Donut conformidade */}
            {totalInsp > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Conformidade Geral</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                      {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLS[i]} />)}
                    </Pie>
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9" }}>{payload[0]?.name}</div><div style={{ fontSize: 12, fontWeight: 700, color: payload[0]?.name === "Pontuadas" ? "#ef4444" : "#34d399" }}>{payload[0]?.value} ({totalInsp > 0 ? Math.round(payload[0]?.value / totalInsp * 100) : 0}%)</div></div> : null} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
                  <span style={{ fontSize: 10, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#34d399" }}></span>Conforme ({conformes})</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#ef4444" }}></span>Pontuadas ({pontuadas})</span>
                </div>
              </div>
            )}

            {/* Gráfico por equipe - comportamento vs condição */}
            {chartData.length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px", marginBottom: 8 }}>
                  <span style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Média por Equipe</span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 9, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#3b9eff" }}></span>Comport.</span>
                    <span style={{ fontSize: 9, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#a78bfa" }}></span>Condição</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 28)}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={v => v + "%"} />
                    <YAxis type="category" dataKey="nome" tick={{ fill: "#d4dce9", fontSize: 10 }} width={65} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#3b9eff" }}>Comportamento: {payload[0]?.value}%</div><div style={{ fontSize: 11, color: "#a78bfa" }}>Condição: {payload[1]?.value}%</div></div> : null} />
                    <Bar dataKey="comportamento" fill="#3b9eff" radius={[0, 3, 3, 0]} barSize={10} />
                    <Bar dataKey="condicao" fill="#a78bfa" radius={[0, 3, 3, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Ranking */}
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Ranking — Inspeções e Pontuações</div>
            {eqInsp.map((eq, i) => {
              const isPont = eq.pont > 0;
              return (
                <div key={eq.id} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 8, opacity: eq.total === 0 ? .3 : 1 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 11, background: eq.total > 0 ? (isPont ? "rgba(239,68,68,.12)" : "rgba(52,211,153,.12)") : "#1e2d48", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: eq.total > 0 ? (isPont ? "#ef4444" : "#34d399") : "#4b6080" }}>{eq.total}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{eq.nome} - {eq.enc}</div>
                    {eq.total > 0 && (
                      <div style={{ fontSize: 9, color: "#5a7aa0", display: "flex", gap: 8 }}>
                        <span>Comp: <strong style={{ color: eq.avgComp >= 100 ? "#34d399" : "#ef4444" }}>{eq.avgComp}%</strong></span>
                        <span>Cond: <strong style={{ color: eq.avgCond >= 100 ? "#34d399" : "#ef4444" }}>{eq.avgCond}%</strong></span>
                        {isPont && <span style={{ color: "#ef4444", fontWeight: 700 }}>· {eq.pont}x pontuada</span>}
                      </div>
                    )}
                  </div>
                  {eq.total > 0 && <div style={{ fontSize: 10, fontWeight: 800, color: isPont ? "#ef4444" : "#34d399" }}>{isPont ? "⚠️" : "✅"}</div>}
                </div>
              );
            })}

            {/* Lista de registros */}
            {iM.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Registros ({iM.length})</div>
                {iM.sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(i => {
                  const eq = EQUIPES.find(e => e.id === i.eqId);
                  const isPont = (Number(i.comportamento) < 100) || (Number(i.condicao) < 100);
                  return (
                    <div key={i._fbKey} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: isPont ? "1px solid rgba(239,68,68,.2)" : "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
                          {eq?.nome} - {eq?.enc} <span style={{ color: "#5a7aa0", fontSize: 9 }}>· {(i.data || "").split("-").reverse().join("/")}</span>
                        </div>
                        <div style={{ fontSize: 10, display: "flex", gap: 10 }}>
                          <span style={{ color: Number(i.comportamento) >= 100 ? "#34d399" : "#ef4444" }}>Comp: {i.comportamento}%</span>
                          <span style={{ color: Number(i.condicao) >= 100 ? "#34d399" : "#ef4444" }}>Cond: {i.condicao}%</span>
                        </div>
                        {i.obs && <div style={{ fontSize: 9, color: "#5a7aa0", fontStyle: "italic" }}>{i.obs}</div>}
                      </div>
                      <span style={{ fontSize: 14 }}>{isPont ? "⚠️" : "✅"}</span>
                      <button onClick={() => fbRemove(bp+"/inspecoes/" + i._fbKey)} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 10, padding: "4px 8px", fontWeight: 700 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* INSPEÇÃO FORM */}
      {screen === "inspecoes" && inspecaoForm && (
        <div style={{ padding: "14px 14px 100px" }}>
          <button onClick={() => setInspecaoForm(null)} style={bk}>← Voltar</button>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 14 }}>Registrar Inspeção</h2>
          <FL label="Equipe"><select value={inspecaoForm.eqId} onChange={e => setInspecaoForm(f => ({ ...f, eqId: e.target.value }))} style={inp}><option value="">Selecione</option>{EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}</select></FL>
          <FL label="Data da inspeção"><input type="date" value={inspecaoForm.data} onChange={e => setInspecaoForm(f => ({ ...f, data: e.target.value }))} style={inp} /></FL>
          <FL label="% Comportamento">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min="0" max="100" value={inspecaoForm.comportamento} onChange={e => setInspecaoForm(f => ({ ...f, comportamento: e.target.value }))} placeholder="0 a 100" style={{ ...inp, flex: 1, fontSize: 18, textAlign: "center", fontWeight: 800, color: Number(inspecaoForm.comportamento) >= 100 ? "#34d399" : Number(inspecaoForm.comportamento) >= 90 ? "#facc15" : Number(inspecaoForm.comportamento) ? "#ef4444" : "#d4dce9" }} />
              <span style={{ fontSize: 18, color: "#5a7aa0", fontWeight: 800 }}>%</span>
            </div>
          </FL>
          <FL label="% Condição">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min="0" max="100" value={inspecaoForm.condicao} onChange={e => setInspecaoForm(f => ({ ...f, condicao: e.target.value }))} placeholder="0 a 100" style={{ ...inp, flex: 1, fontSize: 18, textAlign: "center", fontWeight: 800, color: Number(inspecaoForm.condicao) >= 100 ? "#34d399" : Number(inspecaoForm.condicao) >= 90 ? "#facc15" : Number(inspecaoForm.condicao) ? "#ef4444" : "#d4dce9" }} />
              <span style={{ fontSize: 18, color: "#5a7aa0", fontWeight: 800 }}>%</span>
            </div>
          </FL>
          {(Number(inspecaoForm.comportamento) < 100 || Number(inspecaoForm.condicao) < 100) && (inspecaoForm.comportamento || inspecaoForm.condicao) && (
            <div style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
              ⚠️ Equipe será pontuada (abaixo de 100%)
            </div>
          )}
          <FL label="Observação"><input value={inspecaoForm.obs} onChange={e => setInspecaoForm(f => ({ ...f, obs: e.target.value }))} placeholder="Detalhes da inspeção..." style={inp} /></FL>
          <button onClick={() => {
            if (!inspecaoForm.eqId || !inspecaoForm.comportamento || !inspecaoForm.condicao) return;
            fbPush(bp+"/inspecoes", { ...inspecaoForm, comportamento: Number(inspecaoForm.comportamento), condicao: Number(inspecaoForm.condicao) });
            setInspecaoForm(null);
          }} disabled={!inspecaoForm.eqId || !inspecaoForm.comportamento || !inspecaoForm.condicao} style={{ width: "100%", padding: "13px 0", marginTop: 8, background: (!inspecaoForm.eqId || !inspecaoForm.comportamento || !inspecaoForm.condicao) ? "#1e2d48" : "linear-gradient(135deg,#3b9eff,#2563eb)", color: (!inspecaoForm.eqId || !inspecaoForm.comportamento || !inspecaoForm.condicao) ? "#3d4d66" : "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Registrar Inspeção</button>
        </div>
      )}

      {/* ═══ STATUS DAS NOTAS ═══ */}
      {screen === "status" && (() => {
        const STATUS_OPTS = [
          { value: "", label: "Sem status", color: "#5a7aa0", bg: "transparent", icon: "—" },
          { value: "concluida", label: "Concluída", color: "#34d399", bg: "rgba(52,211,153,.08)", icon: "✅" },
          { value: "cancelada", label: "Cancelada", color: "#ef4444", bg: "rgba(239,68,68,.08)", icon: "🚫" },
          { value: "exec_programado", label: "Exec. Programado", color: "#3b9eff", bg: "rgba(59,158,255,.08)", icon: "📋" },
          { value: "exec_parcial", label: "Exec. Parcial", color: "#facc15", bg: "rgba(250,204,21,.08)", icon: "⚠️" },
        ];
        const getStatus = (notaId) => notaStatus[notaId] || "";
        const getStatusObj = (notaId) => STATUS_OPTS.find(s => s.value === getStatus(notaId)) || STATUS_OPTS[0];
        const setStatusVal = (notaId, value) => fbSet(bp+"/notaStatus/" + notaId, value);

        // View mode: "dia" or "mes"
        const statusMode = statusFilter === "dia_mode" ? "dia" : "mes";
        const setStatusMode = (mode) => setStatusFilter(mode === "dia" ? "dia_mode" : "all");

        // Notas do dia selecionado
        const diaAtribs = atribs.filter(a => a.data === dataSel);
        const notasDoDia = [...new Set(diaAtribs.map(a => a.notaId))].map(nId => notas.find(n => n.id === nId)).filter(Boolean);

        // Notas do mês
        const monthAtribs = atribs.filter(a => a.data?.startsWith(histMonth));
        const notasDoMes = new Set(monthAtribs.map(a => a.notaId));
        const notasFiltered = notas.filter(n => notasDoMes.has(n.id));

        // Filter and search (for month view)
        const filteredMes = notasFiltered.filter(n => {
          const st = getStatus(n.id);
          if (statusFilter !== "all" && statusFilter !== "dia_mode" && st !== statusFilter) return false;
          if (statusSearch) {
            return n.nome.toLowerCase().includes(statusSearch.toLowerCase());
          }
          return true;
        });

        // Summary counts
        const countSource = statusMode === "dia" ? notasDoDia : notasFiltered;
        const counts = { "": 0, concluida: 0, cancelada: 0, exec_programado: 0, exec_parcial: 0 };
        countSource.forEach(n => { const st = getStatus(n.id); counts[st] = (counts[st] || 0) + 1; });

        // Current list based on mode
        const listaNotas = statusMode === "dia" ? notasDoDia : filteredMes;

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>📄 Status das Notas</h2>

            {/* Toggle Dia / Mês */}
            <div style={{ display: "flex", gap: 0, marginBottom: 12, borderRadius: 10, overflow: "hidden", border: "1px solid #1e2d48" }}>
              <button onClick={() => setStatusMode("dia")} style={{ flex: 1, padding: "10px 0", background: statusMode === "dia" ? "linear-gradient(135deg,#eab308,#d97706)" : "#111d33", color: statusMode === "dia" ? "#0b1121" : "#5a7aa0", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>📅 Por Dia</button>
              <button onClick={() => setStatusMode("mes")} style={{ flex: 1, padding: "10px 0", background: statusMode === "mes" ? "linear-gradient(135deg,#3b9eff,#2563eb)" : "#111d33", color: statusMode === "mes" ? "#fff" : "#5a7aa0", border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>📋 Por Mês</button>
            </div>

            {/* Date or Month selector */}
            {statusMode === "dia" ? (
              <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={{ width: "100%", marginBottom: 12, ...inp }} />
            ) : (
              <MonthNav value={histMonth} onChange={setHistMonth} style={{ width: "100%", marginBottom: 12 }} />
            )}

            {/* Summary cards */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
              {STATUS_OPTS.map(s => (
                <div key={s.value || "none"} style={{ flex: "0 0 auto", padding: "8px 12px", background: "#111d33", border: "1px solid #1e2d48", borderRadius: 8, textAlign: "center", minWidth: 65 }}>
                  <div style={{ fontSize: 14 }}>{s.icon}</div>
                  <div className="m" style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{counts[s.value] || 0}</div>
                  <div style={{ fontSize: 7, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>{s.label || "Sem status"}</div>
                </div>
              ))}
            </div>

            {/* Search (month view only) */}
            {statusMode === "mes" && (
              <input value={statusSearch} onChange={e => setStatusSearch(e.target.value)} placeholder="🔍 Pesquisar nota..." style={{ ...inp, marginBottom: 12 }} />
            )}

            {/* Day view info */}
            {statusMode === "dia" && (
              <div style={{ fontSize: 11, color: "#5a7aa0", marginBottom: 8 }}>
                {notasDoDia.length > 0
                  ? <span><strong style={{ color: "#eab308" }}>{notasDoDia.length}</strong> nota(s) programada(s) em <strong style={{ color: "#eab308" }}>{dataSel.split("-").reverse().join("/")}</strong> — defina o status:</span>
                  : <span>Nenhuma nota programada para este dia</span>
                }
              </div>
            )}

            {/* Notas list */}
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
              {statusMode === "dia" ? `Notas do dia (${listaNotas.length})` : `Notas (${listaNotas.length} de ${notasFiltered.length} no mês)`}
            </div>

            {/* KPIs */}
            {(() => {
              const totalNotas = countSource.length;
              const concl = counts.concluida || 0;
              const canc = counts.cancelada || 0;
              const execProg = counts.exec_programado || 0;
              const execParc = counts.exec_parcial || 0;
              const semStatus = counts[""] || 0;
              const txConclusao = totalNotas > 0 ? Math.round(concl / totalNotas * 100) : 0;
              const txExecucao = totalNotas > 0 ? Math.round((concl + execProg + execParc) / totalNotas * 100) : 0;

              // US por status - only notas assigned in selected month
              const notasAtribuidas = new Set(countSource.map(n => n.id));
              const usPorStatus = {};
              STATUS_OPTS.forEach(s => { usPorStatus[s.value] = 0; });
              countSource.forEach(n => { const st = getStatus(n.id); usPorStatus[st] = (usPorStatus[st] || 0) + (n.u || 0); });
              const totalNotasAtrib = countSource.length;

              const donutData = STATUS_OPTS.filter(s => (counts[s.value] || 0) > 0).map(s => ({ name: s.label || "Sem status", value: counts[s.value] || 0 }));
              const DONUT_STATUS_COLORS = STATUS_OPTS.filter(s => (counts[s.value] || 0) > 0).map(s => s.color);

              // US chart data
              const usChartData = STATUS_OPTS.filter(s => s.value && (usPorStatus[s.value] || 0) > 0).map(s => ({
                name: s.label, us: Math.round((usPorStatus[s.value] || 0) * 100) / 100, color: s.color,
              }));

              return (
                <>
                  {/* KPI cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                    <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #34d399" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Taxa Conclusão</div>
                      <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>{txConclusao}%</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>{concl}/{totalNotas} notas</div>
                    </div>
                    <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #3b9eff" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Taxa Execução</div>
                      <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#3b9eff" }}>{txExecucao}%</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>{concl + execProg + execParc} executadas</div>
                    </div>
                    <div style={{ background: "#111d33", borderRadius: 10, padding: "10px 8px", border: "1px solid #1e2d48", textAlign: "center", borderTop: "3px solid #ef4444" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Canceladas</div>
                      <div className="m" style={{ fontSize: 22, fontWeight: 800, color: canc > 0 ? "#ef4444" : "#2d3d56" }}>{canc}</div>
                      <div style={{ fontSize: 9, color: "#5a7aa0" }}>{totalNotas > 0 ? Math.round(canc / totalNotas * 100) : 0}%</div>
                    </div>
                  </div>

                  {/* US por status */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>US Concluídos</div>
                      <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#34d399" }}>{fUS(usPorStatus.concluida || 0)}</div>
                      <div style={{ fontSize: 8, color: "#5a7aa0" }}>notas atribuídas</div>
                    </div>
                    <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48" }}>
                      <div style={{ fontSize: 8, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>US Pendentes</div>
                      <div className="m" style={{ fontSize: 18, fontWeight: 800, color: "#facc15" }}>{fUS((usPorStatus[""] || 0) + (usPorStatus.exec_parcial || 0))}</div>
                      <div style={{ fontSize: 8, color: "#5a7aa0" }}>{totalNotasAtrib} nota(s) em obra</div>
                    </div>
                  </div>

                  {/* Donut */}
                  {donutData.length > 0 && (
                    <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                      <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 4, marginBottom: 6 }}>Distribuição por Status</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={78} dataKey="value" stroke="none">
                            {donutData.map((_, i) => <Cell key={i} fill={DONUT_STATUS_COLORS[i]} />)}
                          </Pie>
                          <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 600 }}>{payload[0]?.name}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#d4dce9" }}>{payload[0]?.value} nota(s) ({totalNotas > 0 ? Math.round(payload[0]?.value / totalNotas * 100) : 0}%)</div></div> : null} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px" }}>
                        {donutData.map((d, i) => (
                          <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_STATUS_COLORS[i], flexShrink: 0 }}></span>
                            {d.name} ({d.value})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* US por status chart */}
                  {usChartData.length > 0 && (
                    <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                      <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>US por Status</div>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={usChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: "#5a7aa0", fontSize: 9 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                          <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                          <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9" }}>{payload[0]?.payload?.name}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#34d399" }}>{fUS(payload[0]?.value)} US</div></div> : null} />
                          <Bar dataKey="us" radius={[4, 4, 0, 0]} barSize={30}>
                            {usChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Search */}
            <input value={statusSearch} onChange={e => setStatusSearch(e.target.value)} placeholder="🔍 Pesquisar nota..." style={{ ...inp, marginBottom: 12 }} />

            {/* Notas list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {listaNotas.map(n => {
                const st = getStatusObj(n.id);
                const retCount = retrab.filter(r => r.notaId === n.id).reduce((s, r) => s + (Number(r.qtd) || 1), 0);
                return (
                  <div key={n.id} style={{ background: st.bg || "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid " + (st.color || "#1e2d48") + "20" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{st.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.nome}</div>
                        <div style={{ fontSize: 9, color: "#5a7aa0" }}>{(n.pontos || []).length} pts · {fUS(n.u)} US{retCount > 0 ? " · 🔴 " + retCount + " retrab." : ""}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: st.color }}>{st.label}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {STATUS_OPTS.filter(s => s.value).map(s => (
                        <button key={s.value} onClick={() => setStatusVal(n.id, getStatus(n.id) === s.value ? "" : s.value)}
                          style={{ padding: "4px 8px", fontSize: 9, fontWeight: getStatus(n.id) === s.value ? 700 : 500, color: getStatus(n.id) === s.value ? s.color : "#5a7aa0", background: getStatus(n.id) === s.value ? s.bg : "#0b1121", border: getStatus(n.id) === s.value ? "1.5px solid " + s.color + "40" : "1px solid #1e2d48", borderRadius: 6, cursor: "pointer" }}>
                          {s.icon} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══ IMPORTAR (gestor) ═══ */}
      {screen === "import" && (
        <div style={{ padding: "14px 14px 100px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 14 }}>Importar Orçamento</h2>
          <label style={{ display: "block", textAlign: "center", padding: "36px 20px", background: "rgba(234,179,8,.04)", border: "2px dashed rgba(234,179,8,.2)", borderRadius: 14, cursor: "pointer", marginBottom: 14 }}><div style={{ fontSize: 28, marginBottom: 6 }}>📂</div><div style={{ fontSize: 13, fontWeight: 700, color: "#eab308" }}>Selecionar Excel</div><input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: "none" }} /></label>
          <div style={{ background: "#111d33", borderRadius: 12, padding: 12, border: "1px solid #1e2d48" }}>
            <div style={{ fontSize: 10, color: "#4b6080", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Banco</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 11, color: "#94a3b8" }}>Notas</span><span className="m" style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>{notas.length}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 11, color: "#94a3b8" }}>Pontos</span><span className="m" style={{ fontSize: 12, fontWeight: 700, color: "#eab308" }}>{notas.reduce((s, n) => s + (n.pontos || []).length, 0)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: "#94a3b8" }}>Total US</span><span className="m" style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{fUS(notas.reduce((s, n) => s + n.u, 0))} US</span></div>
          </div>

          {/* Lista de notas com opção de excluir */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Notas carregadas ({notas.length})</div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {notas.map((n, idx) => (
                <div key={n.id} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.nome}</div>
                    <div style={{ fontSize: 9, color: "#5a7aa0" }}>{(n.pontos || []).length} pts · {fUS(n.u)} US · {BRL(n.r)}</div>
                  </div>
                  <button onClick={() => {
                    if (confirm("Excluir nota: " + n.nome + "?\nAs atribuições ligadas a ela também serão perdidas.")) {
                      const updated = notas.filter((_, i) => i !== idx);
                      fbSet(bp+"/notas", updated.length > 0 ? updated : null);
                    }
                  }} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 10, padding: "4px 8px", fontWeight: 700, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => { fbRemove(bp+"/notas"); fbRemove(bp+"/atribs"); fbRemove(bp+"/retrab"); fbRemove(bp+"/cavas"); fbRemove(bp+"/preps"); fbRemove(bp+"/inspecoes"); fbRemove(bp+"/notaStatus"); setImportMsg("✅ Banco resetado! Reimporte os Excel."); }} style={{ width: "100%", marginTop: 14, padding: "12px 0", background: "rgba(239,68,68,.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,.25)", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑️ Resetar Banco Completo</button>
        </div>
      )}

      {/* ═══ PREPARAÇÃO ═══ */}
      {screen === "preparacao" && prepForm && (
        <div style={{ padding: "14px 14px 100px" }}>
          <button onClick={() => { setPrepForm(null); setScreen("home"); }} style={bk}>← Voltar</button>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>🔧 Lançar Preparação</h2>
          <p style={{ fontSize: 11, color: "#5a7aa0", marginBottom: 14 }}>Registre cavas e serviços de preparação na data em que foram executados</p>

          <FL label="Equipe de Preparação">
            <select value={prepForm.eqId} onChange={e => setPrepForm(f => ({ ...f, eqId: e.target.value }))} style={inp}>
              <option value="">Selecione</option>
              {EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eqLabel(eq)} ({eq.tipo})</option>)}
            </select>
          </FL>

          <FL label="Data da Preparação">
            <input type="date" value={prepForm.data} onChange={e => setPrepForm(f => ({ ...f, data: e.target.value }))} style={inp} />
          </FL>

          <FL label="Nota / Obra (opcional)">
            <input value={prepNotaBusca} onChange={e => { setPrepNotaBusca(e.target.value); setPrepForm(f => ({ ...f, notaId: "" })); }} placeholder="🔍 Pesquisar nota..." style={inp} />
            {prepNotaBusca.length > 0 && !prepForm.notaId && (
              <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {notas.filter(n => n.nome.toLowerCase().includes(prepNotaBusca.toLowerCase())).map(n => (
                  <button key={n.id} onClick={() => { setPrepForm(f => ({ ...f, notaId: n.id })); setPrepNotaBusca(n.nome); }} style={{ padding: "8px 10px", background: "#111d33", border: "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 11, color: "#d4dce9" }}>{n.nome}</button>
                ))}
              </div>
            )}
            {prepForm.notaId && (
              <div style={{ marginTop: 4, padding: "6px 10px", background: "rgba(249,115,22,.08)", borderRadius: 6, border: "1px solid rgba(249,115,22,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#f97316", fontWeight: 600 }}>{notas.find(n => n.id === prepForm.notaId)?.nome}</span>
                <button onClick={() => { setPrepForm(f => ({ ...f, notaId: "" })); setPrepNotaBusca(""); }} style={{ background: "none", border: "none", color: "#5a7aa0", cursor: "pointer", fontSize: 12 }}>✕</button>
              </div>
            )}
          </FL>

          <FL label="Quantidade de cavas">
            <input type="number" min="1" value={prepForm.qtdCavas} onChange={e => setPrepForm(f => ({ ...f, qtdCavas: parseInt(e.target.value) || 1 }))} style={inp} />
            <div className="m" style={{ fontSize: 12, color: "#f97316", fontWeight: 700, marginTop: 6 }}>
              = {fUS(prepForm.qtdCavas * 2)} US ({prepForm.qtdCavas} × 2 US)
            </div>
          </FL>

          <FL label="Observação (opcional)">
            <input value={prepForm.obs} onChange={e => setPrepForm(f => ({ ...f, obs: e.target.value }))} placeholder="Detalhes da preparação..." style={inp} />
          </FL>

          <button onClick={() => {
            if (!prepForm.eqId || !prepForm.data) return;
            fbPush(bp+"/preps", {
              eqId: prepForm.eqId,
              data: prepForm.data,
              notaId: prepForm.notaId || "",
              qtdCavas: prepForm.qtdCavas,
              us: prepForm.qtdCavas * 2,
              obs: prepForm.obs || "",
            });
            setPrepForm(null);
            setScreen("home");
          }} disabled={!prepForm.eqId || !prepForm.data} style={{
            width: "100%", padding: "13px 0", marginTop: 8,
            background: (!prepForm.eqId || !prepForm.data) ? "#1e2d48" : "linear-gradient(135deg,#f97316,#ea580c)",
            color: (!prepForm.eqId || !prepForm.data) ? "#3d4d66" : "#fff",
            border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer",
          }}>Lançar Preparação</button>

          {/* Lista de preparações do mês */}
          {(() => {
            const monthPreps = preps.filter(p => p.data?.startsWith(histMonth));
            if (monthPreps.length === 0) return null;
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Preparações lançadas</div>
                {monthPreps.sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(p => {
                  const eq = EQUIPES.find(e => e.id === p.eqId);
                  const nt = notas.find(n => n.id === p.notaId);
                  return (
                    <div key={p._fbKey} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
                          {eq?.nome} - {eq?.enc} <span style={{ color: "#5a7aa0", fontSize: 9 }}>· {(p.data || "").split("-").reverse().join("/")}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#f97316" }}>{p.qtdCavas} cava(s) · {fUS(p.us)} US</div>
                        {nt && <div style={{ fontSize: 9, color: "#5a7aa0" }}>Nota: {nt.nome}</div>}
                        {p.obs && <div style={{ fontSize: 9, color: "#5a7aa0", fontStyle: "italic" }}>{p.obs}</div>}
                      </div>
                      <button onClick={() => fbRemove(bp+"/preps/" + p._fbKey)} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 10, padding: "4px 8px", fontWeight: 700 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ PREPARAÇÃO VIEW (gestor) ═══ */}
      {screen === "preparacao_view" && (
        <div style={{ padding: "12px 14px 100px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>🔧 Preparações</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <MonthNav value={histMonth} onChange={setHistMonth} style={{ flex: 1 }} />
            <select value={histEq} onChange={e => setHistEq(e.target.value)} style={{ flex: 1, ...inp }}>
              <option value="all">Todas equipes</option>
              {EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}
            </select>
          </div>

          {(() => {
            const pAll = preps.filter(p => p.data?.startsWith(histMonth));
            const pM = histEq === "all" ? pAll : pAll.filter(p => p.eqId === histEq);
            const totalCavas = pM.reduce((s, p) => s + (Number(p.qtdCavas) || 0), 0);
            const totalUS = pM.reduce((s, p) => s + (Number(p.us) || 0), 0);

            // Per equipe
            const eqPreps = EQUIPES.map(eq => ({
              ...eq,
              cavas: pM.filter(p => p.eqId === eq.id).reduce((s, p) => s + (Number(p.qtdCavas) || 0), 0),
              us: pM.filter(p => p.eqId === eq.id).reduce((s, p) => s + (Number(p.us) || 0), 0),
            })).filter(e => e.cavas > 0).sort((a, b) => b.us - a.us);

            return (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48", borderLeft: "3px solid #f97316" }}>
                    <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Cavas no mês</div>
                    <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#f97316" }}>{totalCavas}</div>
                  </div>
                  <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48", borderLeft: "3px solid #34d399" }}>
                    <div style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>US preparação</div>
                    <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#34d399" }}>{fUS(totalUS)}</div>
                  </div>
                </div>

                {eqPreps.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Por Equipe</div>
                    {eqPreps.map(eq => (
                      <div key={eq.id} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{eq.nome} - {eq.enc}</div>
                        <div style={{ textAlign: "right" }}>
                          <span className="m" style={{ fontSize: 12, fontWeight: 800, color: "#f97316" }}>{eq.cavas} cavas</span>
                          <span className="m" style={{ fontSize: 10, color: "#5a7aa0", marginLeft: 8 }}>{fUS(eq.us)} US</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Lista de registros */}
                <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Registros ({pM.length})</div>
                {pM.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 20, color: "#3a5070", fontSize: 12 }}>Nenhuma preparação registrada neste mês</div>
                ) : (
                  pM.sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(p => {
                    const eq = EQUIPES.find(e => e.id === p.eqId);
                    const nt = notas.find(n => n.id === p.notaId);
                    return (
                      <div key={p._fbKey} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
                            {eq?.nome} - {eq?.enc} <span style={{ color: "#5a7aa0", fontSize: 9 }}>· {(p.data || "").split("-").reverse().join("/")}</span>
                          </div>
                          {nt && <div style={{ fontSize: 9, color: "#f97316" }}>Nota: {nt.nome}</div>}
                          {p.obs && <div style={{ fontSize: 9, color: "#5a7aa0", fontStyle: "italic" }}>{p.obs}</div>}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div className="m" style={{ fontSize: 12, fontWeight: 800, color: "#f97316" }}>{p.qtdCavas} cava(s)</div>
                          <div className="m" style={{ fontSize: 10, color: "#34d399" }}>{fUS(p.us)} US</div>
                        </div>
                        <button onClick={() => fbRemove(bp+"/preps/" + p._fbKey)} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 10, padding: "4px 8px", fontWeight: 700 }}>✕</button>
                      </div>
                    );
                  })
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ═══ ATRIBUIR (auxiliar) ═══ */}
      {screen === "atribuir" && atribForm && (
        <div style={{ padding: "14px 14px 100px" }}>
          <button onClick={() => { setAtribForm(null); setScreen("home"); }} style={bk}>← Voltar</button>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 14 }}>Atribuir Pontos</h2>
          <FL label="Equipe"><select value={atribForm.eqId} onChange={e => setAtribForm(f => ({ ...f, eqId: e.target.value }))} style={inp}><option value="">Selecione</option>{EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eqLabel(eq)} ({eq.tipo})</option>)}</select></FL>
          <FL label="Nota / Obra">
            <input value={notaBusca} onChange={e => { setNotaBusca(e.target.value); setAtribForm(f => ({ ...f, notaId: "", pIds: [] })); }} placeholder="🔍 Pesquisar nota..." style={inp} />
            {notaBusca.length > 0 && !atribForm.notaId && (
              <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {notas.filter(n => n.nome.toLowerCase().includes(notaBusca.toLowerCase())).map(n => (
                  <button key={n.id} onClick={() => { setAtribForm(f => ({ ...f, notaId: n.id, pIds: [] })); setNotaBusca(n.nome); }} style={{ padding: "8px 10px", background: "#111d33", border: "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 11, color: "#d4dce9", display: "flex", justifyContent: "space-between" }}>
                    <span style={{ flex: 1 }}>{n.nome}</span>
                    <span className="m" style={{ fontSize: 10, color: "#eab308", marginLeft: 8 }}>{(n.pontos || []).length} pts · {fUS(n.u)} US</span>
                  </button>
                ))}
                {notas.filter(n => n.nome.toLowerCase().includes(notaBusca.toLowerCase())).length === 0 && (
                  <div style={{ padding: 10, fontSize: 11, color: "#4b6080", textAlign: "center" }}>Nenhuma nota encontrada</div>
                )}
              </div>
            )}
            {atribForm.notaId && (
              <div style={{ marginTop: 4, padding: "6px 10px", background: "rgba(96,165,250,.08)", borderRadius: 6, border: "1px solid rgba(96,165,250,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>{notas.find(n => n.id === atribForm.notaId)?.nome}</span>
                <button onClick={() => { setAtribForm(f => ({ ...f, notaId: "", pIds: [] })); setNotaBusca(""); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 12 }}>✕</button>
              </div>
            )}
          </FL>
          {notaSel && (<FL label={"Pontos (" + ptsDispo.length + ")"}>
            {ptsDispo.length === 0 ? <div style={{ fontSize: 11, color: "#f97316", padding: 10 }}>Todos atribuídos</div> : (<>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <button onClick={() => setAtribForm(f => ({ ...f, pIds: ptsDispo.map(p => p.id) }))} style={{ padding: "4px 10px", background: "#1e2d48", color: "#60a5fa", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Todos</button>
                <button onClick={() => setAtribForm(f => ({ ...f, pIds: [] }))} style={{ padding: "4px 10px", background: "#1e2d48", color: "#94a3b8", border: "none", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Limpar</button>
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                {ptsDispo.map(p => { const sel = atribForm.pIds.includes(p.id); return (
                  <div key={p.id} onClick={() => setAtribForm(f => ({ ...f, pIds: sel ? f.pIds.filter(x => x !== p.id) : [...f.pIds, p.id] }))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: sel ? "rgba(234,179,8,.06)" : "#111d33", border: sel ? "1.5px solid rgba(234,179,8,.25)" : "1px solid #1e2d48", borderRadius: 8, cursor: "pointer" }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: sel ? "2px solid #eab308" : "1.5px solid #3d4d66", background: sel ? "#eab308" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#0b1121" }}>{sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{p.n}</div></div>
                    <div className="m" style={{ fontSize: 10, fontWeight: 700, color: "#eab308" }}>{fUS(p.u)} US</div>
                  </div>
                ); })}
              </div>
              {atribForm.pIds.length > 0 && (<div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(234,179,8,.05)", borderRadius: 8, border: "1px solid rgba(234,179,8,.12)", display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: "#eab308", fontWeight: 700 }}>{atribForm.pIds.length} pts</span><span className="m" style={{ fontSize: 12, fontWeight: 800, color: "#eab308" }}>{fUS(ptsDispo.filter(p => atribForm.pIds.includes(p.id)).reduce((s, p) => s + p.u, 0))} US</span></div>)}
            </>)}
          </FL>)}
          <button onClick={salvarAtrib} disabled={!atribForm.eqId || !atribForm.notaId || !atribForm.pIds.length} style={{ width: "100%", padding: "13px 0", marginTop: 8, background: (!atribForm.eqId || !atribForm.notaId || !atribForm.pIds.length) ? "#1e2d48" : "linear-gradient(135deg,#eab308,#d97706)", color: (!atribForm.eqId || !atribForm.notaId || !atribForm.pIds.length) ? "#3d4d66" : "#0b1121", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Atribuir</button>
        </div>
      )}

      {/* ═══ CAVA MODAL ═══ */}
      {cavaModal && (() => {
        // Check if a prep was already registered for this nota
        const cavaNotaId = (() => { const atrib = atribs.find(a => (a._fbKey || a.id) === cavaModal.atribKey); return atrib?.notaId || ""; })();
        const existingPreps = preps.filter(p => p.notaId === cavaNotaId);
        return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#111d33", borderRadius: 16, padding: 20, maxWidth: 340, width: "100%", border: "1px solid #1e2d48", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>🔧 Abertura de Cava</div>
            <div style={{ fontSize: 12, color: "#5a7aa0", marginBottom: 12 }}>Ponto <strong style={{ color: "#eab308" }}>{cavaModal.pontoNome}</strong> — houve cava (2 US)?</div>
            
            {existingPreps.length > 0 && (
              <div style={{ background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#34d399", fontWeight: 700, marginBottom: 4 }}>✅ Preparação já registrada nesta nota</div>
                {existingPreps.map(p => {
                  const prepEq = EQUIPES.find(e => e.id === p.eqId);
                  return (
                    <div key={p._fbKey || p.id} style={{ fontSize: 10, color: "#5a7aa0" }}>
                      {prepEq?.nome} - {prepEq?.enc} · {(p.data || "").split("-").reverse().join("/")} · {p.qtdCavas} cava(s)
                    </div>
                  );
                })}
                <button onClick={() => { setCavaModal(null); }} style={{ width: "100%", marginTop: 8, padding: "8px 0", background: "#1e2d48", color: "#34d399", border: "1px solid rgba(34,197,94,.2)", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Já preparado — não descontar novamente</button>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#5a7aa0", textTransform: "uppercase", marginBottom: 4 }}>Data da preparação</label>
              <input type="date" value={cavaData} onChange={e => setCavaData(e.target.value)} style={{ ...inp, fontSize: 12 }} />
            </div>
            
            <div style={{ fontSize: 10, fontWeight: 700, color: "#5a7aa0", textTransform: "uppercase", marginBottom: 4 }}>Equipe de preparação</div>
            <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
              {EQUIPES.map(eq => (<button key={eq.id} onClick={() => salvarCava(eq.id)} style={{ padding: "9px 12px", background: "#0b1121", border: "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#d4dce9", display: "flex", justifyContent: "space-between" }}><span>{eq.nome} - {eq.enc}</span><span style={{ color: tipoCor(eq.tipo), fontSize: 9 }}>{eq.tipo}</span></button>))}
            </div>
            <button onClick={() => setCavaModal(null)} style={{ width: "100%", padding: "10px 0", background: "#1e2d48", color: "#94a3b8", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Não houve cava</button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

const inp = { width: "100%", padding: "9px 12px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, color: "#d4dce9", fontSize: 13, boxSizing: "border-box" };
const bk = { background: "none", border: "none", color: "#60a5fa", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 0 };
function FL({ label, children }) { return (<div style={{ marginBottom: 12 }}><label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#4b6080", textTransform: "uppercase", letterSpacing: .6, marginBottom: 5 }}>{label}</label>{children}</div>); }
function MonthNav({ value, onChange, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, ...style }}>
      <button onClick={() => onChange(prevMonth(value))} style={{ width: 32, height: 36, background: "#1a2540", border: "1px solid #2d3d56", borderRadius: "8px 0 0 8px", color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
      <div onClick={() => { const el = document.getElementById("_mNav"); if (el) el.showPicker?.(); }} style={{ flex: 1, position: "relative" }}>
        <div style={{ padding: "8px 12px", background: "#1a2540", border: "1px solid #2d3d56", borderLeft: "none", borderRight: "none", color: "#d4dce9", fontSize: 13, textAlign: "center", fontWeight: 700, cursor: "pointer" }}>{monthLabel(value)}</div>
        <input id="_mNav" type="month" value={value} onChange={e => onChange(e.target.value)} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
      </div>
      <button onClick={() => onChange(nextMonth(value))} style={{ width: 32, height: 36, background: "#1a2540", border: "1px solid #2d3d56", borderRadius: "0 8px 8px 0", color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>→</button>
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area, ComposedChart, Line, PieChart, Pie, ReferenceLine } from "recharts";
import { db, ref, set, onValue, push, remove } from "./firebase";
import { EQUIPES, INIT_NOTAS, DIAS_UTEIS, DIVISOR_US, MOTIVOS_RETRAB, SERVICOS_LISTA } from "./data";
import * as XLSX from "xlsx";

const today = new Date().toISOString().split("T")[0];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const BRL = v => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fUS = v => (v || 0).toFixed(2);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const pctCol = p => (p >= 100 ? "#34d399" : p >= 70 ? "#a3e635" : p >= 40 ? "#facc15" : p > 0 ? "#fb923c" : "#475569");
const tipoCor = t => (t === "B3" ? "#3b9eff" : t === "C1" ? "#a78bfa" : t === "B1" ? "#fbbf24" : "#475569");
const eqLabel = eq => eq.nome + " - " + eq.enc;

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
    const unsub = onValue(ref(db, path), snap => {
      setData(snap.exists() ? snap.val() : fallback);
      setLoading(false);
    });
    return () => unsub();
  }, [path]);
  return [data, loading];
}

// Convert firebase object to array
function fbToArr(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  return Object.entries(obj).map(([k, v]) => ({ ...v, _fbKey: k }));
}

export default function App() {
  const [role, setRole] = useState(null); // null | "auxiliar" | "gestor"
  const [notasRaw, notasLoading] = useFBData("notas", null);
  const [atribsRaw] = useFBData("atribs", {});
  const [retrabRaw] = useFBData("retrab", {});
  const [cavasRaw] = useFBData("cavas", {});

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
  const [importMsg, setImportMsg] = useState("");
  const [notaBusca, setNotaBusca] = useState("");
  const [retNotaBusca, setRetNotaBusca] = useState("");

  // Init notas if empty
  useEffect(() => {
    if (!notasLoading && !notasRaw) {
      fbSet("notas", INIT_NOTAS);
    }
  }, [notasLoading, notasRaw]);

  const notas = useMemo(() => fbToArr(notasRaw) || [], [notasRaw]);
  const atribs = useMemo(() => fbToArr(atribsRaw), [atribsRaw]);
  const retrab = useMemo(() => fbToArr(retrabRaw), [retrabRaw]);
  const cavas = useMemo(() => fbToArr(cavasRaw), [cavasRaw]);

  const doDia = atribs.filter(a => a.data === dataSel);
  const eqMap = useMemo(() => { const m = {}; doDia.forEach(a => { if (!m[a.eqId]) m[a.eqId] = []; m[a.eqId].push(a); }); return m; }, [doDia]);

  const getPts = useCallback((nId, pIds) => { const n = notas.find(x => x.id === nId); return n ? (n.pontos || []).filter(p => pIds.includes(p.id)) : []; }, [notas]);

  const getAtribReal = useCallback((a) => {
    const pts = getPts(a.notaId, a.pIds); const st = a.status || {};
    const cR = pts.filter(p => st[p.id] === "ok").reduce((s, p) => s + p.r, 0);
    const cU = pts.filter(p => st[p.id] === "ok").reduce((s, p) => s + p.u, 0);
    const eR = (a.extras || []).reduce((s, e) => s + (Number(e.valor) || 0), 0);
    const cavaCount = cavas.filter(c => c.atribId === (a._fbKey || a.id)).length;
    const cavaUS = cavaCount * 2;
    return { realR: cR + eR - cavaUS * DIVISOR_US, realUS: cU + eR / DIVISOR_US - cavaUS };
  }, [getPts, cavas]);

  const getCavaUS = useCallback((eqId, filterFn) => cavas.filter(c => c.prepEqId === eqId && filterFn(c)).length * 2, [cavas]);

  const getTotals = useCallback((ea) => {
    let pR = 0, pU = 0, rR = 0, rU = 0, nP = 0;
    ea.forEach(a => { const pts = getPts(a.notaId, a.pIds); pR += pts.reduce((s, p) => s + p.r, 0); pU += pts.reduce((s, p) => s + p.u, 0); const ar = getAtribReal(a); rR += ar.realR; rU += ar.realUS; nP += pts.length; });
    if (ea.length > 0) { const cUS = getCavaUS(ea[0].eqId, c => ea.some(a => a.data === c.data)); rU += cUS; rR += cUS * DIVISOR_US; }
    return { prevR: pR, prevUS: pU, realR: rR, realUS: rU, nPts: nP };
  }, [getPts, getAtribReal, getCavaUS]);

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
    fbPush("cavas", { atribId: cavaModal.atribKey, pontoId: cavaModal.pontoId, prepEqId, data: cavaModal.data });
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
    fbPush("atribs", { id: uid(), eqId: atribForm.eqId, notaId: atribForm.notaId, pIds: atribForm.pIds, data: dataSel, status: {}, extras: [] });
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
        const valor = parseFloat(r[rColIdx]) || 0;
        const us = valor / DIVISOR_US;
        if (!map[nota]) map[nota] = {};
        if (!map[nota][ponto]) map[nota][ponto] = { sc: 0, r: 0, u: 0 };
        map[nota][ponto].sc++; map[nota][ponto].r += valor; map[nota][ponto].u += us;
      });
      const existIds = new Set(notas.map(n => n.nome));
      const newN = [];
      Object.entries(map).forEach(([nome, pontos]) => {
        if (existIds.has(nome)) return;
        const pts = Object.entries(pontos).map(([pn, pd]) => ({
          id: uid(), n: pn, sc: pd.sc, r: Math.round(pd.r * 100) / 100, u: Math.round(pd.u * 10000) / 10000
        }));
        newN.push({ id: uid(), nome, pontos: pts, r: Math.round(pts.reduce((s, p) => s + p.r, 0) * 100) / 100, u: Math.round(pts.reduce((s, p) => s + p.u, 0) * 10000) / 10000 });
      });
      if (newN.length === 0) { setImportMsg("Nenhuma nota nova."); }
      else {
        const updated = [...notas, ...newN];
        fbSet("notas", updated);
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
    return Math.round(rU * 100) / 100;
  }, [atribs, getAtribReal, getCavaUS]);

  const getEqDayUS = useCallback((eqId, dateStr) => {
    const dA = atribs.filter(a => a.data === dateStr && a.eqId === eqId);
    let rU = 0; dA.forEach(a => { rU += getAtribReal(a).realUS; });
    rU += getCavaUS(eqId, c => c.data === dateStr);
    return Math.round(rU * 100) / 100;
  }, [atribs, getAtribReal, getCavaUS]);

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
  if (!role) {
    return (
      <div style={{ minHeight: "100vh", background: "#0b1121", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@600;700;800&display=swap');`}</style>
        <div style={{ textAlign: "center", padding: 30 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#eab308,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#0b1121"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", marginBottom: 4 }}>Produção Diária</h1>
          <p style={{ fontSize: 12, color: "#4b6080", marginBottom: 30 }}>Controle BT / MT</p>

          <button onClick={() => setRole("auxiliar")} style={{
            width: "100%", maxWidth: 280, padding: "16px 24px", marginBottom: 12,
            background: "linear-gradient(135deg,#eab308,#d97706)", color: "#0b1121",
            border: "none", borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: "pointer",
          }}>
            Auxiliar Técnico
          </button>
          <div style={{ fontSize: 10, color: "#4b6080", marginBottom: 20 }}>Preencher produção, atribuir pontos, registrar retrabalho</div>

          <button onClick={() => setRole("gestor")} style={{
            width: "100%", maxWidth: 280, padding: "16px 24px",
            background: "transparent", color: "#60a5fa",
            border: "2px solid #1e2d48", borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: "pointer",
          }}>
            Gestor
          </button>
          <div style={{ fontSize: 10, color: "#4b6080", marginTop: 6 }}>Monitorar indicadores, importar orçamentos, gráficos</div>
        </div>
      </div>
    );
  }

  const isGestor = role === "gestor";
  const tabs = isGestor
    ? [{ k: "home", l: "Painel" }, { k: "ranking", l: "Ranking" }, { k: "historico", l: "Histórico" }, { k: "retrabalho", l: "Retrabalho" }, { k: "import", l: "Importar" }]
    : [{ k: "home", l: "Painel" }, { k: "retrabalho", l: "Retrabalho" }];

  // ═══ MAIN APP ═══
  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b1121", color: "#d4dce9", fontFamily: "'DM Sans',system-ui,sans-serif", overflowY: "auto", zIndex: 9999 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700;800&display=swap');*{box-sizing:border-box;margin:0}input,select,button{font-family:inherit}::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#2d3d56;border-radius:3px}.m{font-family:'JetBrains Mono',monospace}`}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f1a2e,#162240)", padding: "10px 16px", borderBottom: "1px solid #1e2d48" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#eab308,#d97706)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0b1121"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#f8fafc" }}>Produção Diária</div>
              <div style={{ fontSize: 9, color: "#4b6080", fontWeight: 600 }}>
                {isGestor ? "👔 Gestor" : "🔧 Auxiliar"} · {notas.length} notas
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {["home", "detalhe"].includes(screen) && <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={{ padding: "4px 6px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 6, color: "#94a3b8", fontSize: 11 }} />}
            <button onClick={() => { setRole(null); setScreen("home"); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 10, fontWeight: 600 }}>Sair</button>
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

      {/* ═══ HOME ═══ */}
      {!notasLoading && screen === "home" && (
        <div style={{ padding: "12px 14px 100px" }}>

          {/* Speedometer - Meta Mensal */}
          <div style={{ background: "linear-gradient(135deg,#0d1829,#132035)", borderRadius: 16, padding: "18px 14px", marginBottom: 12, border: "1px solid #1a2d4d" }}>
            <Gauge value={mesTotalRealUS} max={mesMetaTotal} label={`Meta mensal: ${fUS(mesMetaTotal)} US`} sublabel={`${mesDiasComDados} dia(s) lançado(s) de ${DIAS_UTEIS}`} />
          </div>

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

          {!isGestor && <button onClick={() => { setAtribForm({ eqId: "", notaId: "", pIds: [] }); setScreen("atribuir"); }} style={{ width: "100%", padding: "12px 0", background: "linear-gradient(135deg,#f5c518,#e6a817)", color: "#0b1121", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 12, boxShadow: "0 4px 16px rgba(245,197,24,.2)" }}>+ Atribuir Pontos</button>}

          <div style={{ fontSize: 10, fontWeight: 700, color: "#5a7aa0", textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>Equipes — {Object.keys(eqMap).length}/{EQUIPES.length}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {EQUIPES.map(eq => {
              const ea = eqMap[eq.id] || [];
              if (!ea.length) return (<div key={eq.id} style={{ background: "#0d1829", borderRadius: 10, padding: "10px 12px", border: "1px dashed #1a2d4d", opacity: .35, display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><span style={{ fontSize: 11, fontWeight: 700, color: "#5a7aa0" }}>{eqLabel(eq)}</span><span style={{ fontSize: 9, color: tipoCor(eq.tipo), marginLeft: 6, fontWeight: 700 }}>{eq.tipo}</span></div><span style={{ fontSize: 10, color: "#2d3d56" }}>—</span></div>);
              const t = getTotals(ea); const pc = pct(t.realUS, eq.meta);
              let okC = 0, totP = 0; ea.forEach(a => { const pts = getPts(a.notaId, a.pIds); totP += pts.length; pts.forEach(p => { if ((a.status || {})[p.id] === "ok") okC++; }); });
              const extC = ea.reduce((s, a) => (a.extras || []).length + s, 0);
              // Média diária
              const eqMesUS = getEqMonthUS(eq.id, histMonth);
              const mediaDia = mesDiasComDados > 0 ? (eqMesUS / mesDiasComDados) : 0;
              return (
                <div key={eq.id} onClick={() => { setSelEq(ea); setScreen("detalhe"); }} style={{ background: "#0d1829", borderRadius: 12, border: "1.5px solid " + pctCol(pc) + "30", padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "border-color .2s" }}>
                  <Ring value={t.realUS} max={eq.meta || t.prevUS} size={46} stroke={4} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#f1f5f9" }}>{eqLabel(eq)} <span style={{ fontSize: 9, color: tipoCor(eq.tipo), fontWeight: 700, background: tipoCor(eq.tipo) + "18", padding: "1px 5px", borderRadius: 4 }}>{eq.tipo}</span></div>
                    <div style={{ fontSize: 10, color: "#5a7aa0" }}>✅ {okC}/{totP}{extC > 0 ? " · +" + extC + " extra" : ""}</div>
                    <div style={{ fontSize: 9, color: "#3a5070" }}>Média mês: {fUS(mediaDia)} US/dia</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div className="m" style={{ fontSize: 14, fontWeight: 800, color: "#34d399" }}>{fUS(t.realUS)} US</div>
                    <div className="m" style={{ fontSize: 9, color: "#5a7aa0" }}>meta: {eq.meta} US</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  {pts.map(pt => { const s = st[pt.id] || "pending"; const ptCava = cavas.find(c => c.atribId === aKey && c.pontoId === pt.id); const prepEq = ptCava ? EQUIPES.find(e => e.id === ptCava.prepEqId) : null; return (
                    <div key={pt.id}>
                      <div onClick={() => !isGestor && togglePonto(aKey, pt.id)} style={{ background: s === "ok" ? "rgba(34,197,94,.06)" : s === "no" ? "rgba(239,68,68,.06)" : "#0b1121", borderRadius: ptCava ? "8px 8px 0 0" : "8px", padding: "8px 10px", marginBottom: ptCava ? 0 : 3, border: "1px solid " + (s === "ok" ? "rgba(34,197,94,.15)" : s === "no" ? "rgba(239,68,68,.15)" : "#1a2540"), display: "flex", alignItems: "center", gap: 8, cursor: isGestor ? "default" : "pointer" }}>
                        <span style={{ fontSize: 16 }}>{sI(s)}</span>
                        <div style={{ flex: 1 }}><span style={{ fontSize: 11, fontWeight: 600, color: s === "no" ? "#ef4444" : "#d1d9e6", textDecoration: s === "no" ? "line-through" : "none" }}>{pt.n}</span></div>
                        <span className="m" style={{ fontSize: 10, fontWeight: 700, color: s === "ok" ? "#22c55e" : s === "no" ? "#ef4444" : "#eab308" }}>{fUS(ptCava ? pt.u - 2 : pt.u)} US</span>
                      </div>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input type="month" value={histMonth} onChange={e => setHistMonth(e.target.value)} style={{ flex: 1, ...inp }} />
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={{ flex: 1, ...inp }} />
          </div>
          <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px", marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase" }}>Produção Mensal — US</span>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#34d399" }}></span>Realizado</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#94a3b8" }}><span style={{ width: 10, height: 2, borderRadius: 1, background: "#3b9eff" }}></span>Meta</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={ranking.filter(e => e.meta > 0)} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                <XAxis dataKey="enc" tick={{ fill: "#5a7aa0", fontSize: 9 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} angle={-35} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "#5a7aa0", fontSize: 8 }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px" }}><div style={{ fontSize: 12, color: "#f1f5f9", fontWeight: 700, marginBottom: 4 }}>{payload[0]?.payload?.nome} - {payload[0]?.payload?.enc}</div><div style={{ fontSize: 11, color: "#34d399" }}>Realizado: {fUS(payload[0]?.payload?.mesUS)} US</div><div style={{ fontSize: 11, color: "#3b9eff" }}>Meta: {payload[0]?.payload?.metaMes} US</div><div style={{ fontSize: 11, color: pctCol(payload[0]?.payload?.pctMes) }}>{payload[0]?.payload?.pctMes}%</div></div> : null} />
                <Bar dataKey="mesUS" name="Realizado" radius={[4, 4, 0, 0]} barSize={18}>
                  {ranking.filter(e => e.meta > 0).map((e, i) => <Cell key={i} fill={pctCol(e.pctMes)} />)}
                </Bar>
                <Line type="monotone" dataKey="metaMes" name="Meta" stroke="#3b9eff" strokeWidth={2.5} strokeDasharray="6 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 10, color: "#4b6080", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Detalhamento</div>
          {ranking.map((eq, i) => (<div key={eq.id} style={{ background: "#111d33", borderRadius: 10, padding: "10px 12px", marginBottom: 4, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 8 }}>
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
        </div>
      )}

      {/* ═══ HISTÓRICO (gestor) ═══ */}
      {screen === "historico" && (
        <div style={{ padding: "12px 14px 100px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 12 }}>Histórico (US)</h2>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input type="month" value={histMonth} onChange={e => setHistMonth(e.target.value)} style={{ flex: 1, ...inp }} />
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
        const rM = retrab.filter(r => r.data?.startsWith(histMonth));
        const totalM = rM.reduce((s, r) => s + (Number(r.qtd) || 1), 0);
        const mC = {}; rM.forEach(r => { const m = r.motivo || "?"; mC[m] = (mC[m] || 0) + (Number(r.qtd) || 1); });
        const mS = Object.entries(mC).sort((a, b) => b[1] - a[1]); const mMax = mS.length > 0 ? mS[0][1] : 1;
        const eR = EQUIPES.map(eq => ({ ...eq, total: rM.filter(r => r.eqId === eq.id).reduce((s, r) => s + (Number(r.qtd) || 1), 0) })).sort((a, b) => b.total - a.total);
        const eRChart = eR.filter(e => e.total > 0);

        // Daily chart
        const [cy, cm] = histMonth.split("-").map(Number); const dInM = new Date(cy, cm, 0).getDate();
        const dailyData = []; for (let d = 1; d <= dInM; d++) { const ds = histMonth + "-" + String(d).padStart(2, "0"); dailyData.push({ dia: d, qtd: rM.filter(r => r.data === ds).reduce((s, r) => s + (Number(r.qtd) || 1), 0) }); }

        return (
          <div style={{ padding: "12px 14px 100px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9" }}>Retrabalho</h2>
              {!isGestor && <button onClick={() => setRetForm({ eqId: "", data: dataSel, qtd: 1, notaId: "", pontoNome: "", motivo: "", obs: "" })} style={{ padding: "7px 14px", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", border: "none", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>+ Registrar</button>}
            </div>
            <input type="month" value={histMonth} onChange={e => setHistMonth(e.target.value)} style={{ width: "100%", marginBottom: 12, ...inp }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48", borderLeft: "3px solid #ef4444" }}><div style={{ fontSize: 9, color: "#4b6080", fontWeight: 700, textTransform: "uppercase" }}>Total</div><div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#ef4444" }}>{totalM}</div></div>
              <div style={{ flex: 1, background: "#111d33", borderRadius: 10, padding: "10px 12px", border: "1px solid #1e2d48", borderLeft: "3px solid #f97316" }}><div style={{ fontSize: 9, color: "#4b6080", fontWeight: 700, textTransform: "uppercase" }}>Equipes</div><div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#f97316" }}>{new Set(rM.map(r => r.eqId)).size}</div></div>
            </div>

            {/* Gráfico diário */}
            {totalM > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#4b6080", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Retrabalhos por Dia</div>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={dailyData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: "#4b6080", fontSize: 8 }} axisLine={{ stroke: "#1e2d48" }} tickLine={false} />
                    <YAxis tick={{ fill: "#4b6080", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#94a3b8" }}>Dia {label}</div><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>{payload[0].value} retrabalho(s)</div></div> : null} />
                    <Bar dataKey="qtd" radius={[3, 3, 0, 0]} barSize={8}>{dailyData.map((d, i) => <Cell key={i} fill={d.qtd > 0 ? "#ef4444" : "#1e2d48"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Gráfico por equipe */}
            {eRChart.length > 0 && (
              <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 6px 6px", border: "1px solid #1e2d48", marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: "#4b6080", fontWeight: 700, textTransform: "uppercase", paddingLeft: 8, marginBottom: 6 }}>Retrabalhos por Equipe</div>
                <ResponsiveContainer width="100%" height={Math.max(120, eRChart.length * 28)}>
                  <BarChart data={eRChart} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d48" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#4b6080", fontSize: 8 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="enc" tick={{ fill: "#d4dce9", fontSize: 10 }} width={70} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 700 }}>{payload[0]?.payload?.nome} - {payload[0]?.payload?.enc}</div><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>{payload[0]?.value} retrabalho(s)</div></div> : null} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={14} fill="#ef4444">
                      {eRChart.map((e, i) => <Cell key={i} fill={i === 0 ? "#ef4444" : i === 1 ? "#f97316" : "#fb923c"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {mS.length > 0 && (() => {
              const DONUT_COLORS = ["#ef4444","#f97316","#facc15","#a78bfa","#3b9eff","#34d399","#f472b6","#fb923c","#6ee7b7","#818cf8","#94a3b8","#fbbf24"];
              const donutData = mS.map(([name, value]) => ({ name, value }));
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Motivos de retrabalho</div>
                  <div style={{ background: "#111d33", borderRadius: 14, padding: "12px 8px", border: "1px solid #1e2d48", marginBottom: 8 }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                          {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                        </Pie>
                        <Tooltip content={({ active, payload }) => active && payload?.length ? <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 11, color: "#f1f5f9", fontWeight: 600 }}>{payload[0]?.name}</div><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>{payload[0]?.value} ({Math.round(payload[0]?.value / totalM * 100)}%)</div></div> : null} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", padding: "0 4px" }}>
                      {donutData.map((d, i) => (
                        <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }}></span>
                          {d.name} ({d.value})
                        </span>
                      ))}
                    </div>
                  </div>
                  {mS.map(([m, c]) => (<div key={m} style={{ background: "#111d33", borderRadius: 6, padding: "6px 10px", marginBottom: 3, border: "1px solid #1e2d48" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}><span style={{ fontSize: 11, color: "#e2e8f0" }}>{m}</span><span className="m" style={{ fontSize: 11, fontWeight: 800, color: "#ef4444" }}>{c}</span></div><div style={{ height: 3, background: "rgba(255,255,255,.05)", borderRadius: 3 }}><div style={{ height: "100%", width: (c / mMax * 100) + "%", background: "#ef4444", borderRadius: 3 }} /></div></div>))}
                </div>
              );
            })()}
            <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Ranking por Equipe</div>
            {eR.map((eq, i) => (<div key={eq.id} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 8, opacity: eq.total === 0 ? .3 : 1 }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: eq.total > 0 && i < 3 ? ["#ef4444", "#f97316", "#fb923c"][i] + "22" : "#1e2d48", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: eq.total > 0 && i < 3 ? ["#ef4444", "#f97316", "#fb923c"][i] : "#4b6080" }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{eq.nome} - {eq.enc}</div>
              <div className="m" style={{ fontSize: 14, fontWeight: 800, color: eq.total > 0 ? "#ef4444" : "#2d3d56" }}>{eq.total}</div>
            </div>))}

            {/* Lista de registros com botão de remover */}
            {rM.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 10, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Registros do Mês ({rM.length})</div>
                {rM.sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(r => {
                  const eq = EQUIPES.find(e => e.id === r.eqId);
                  const nt = notas.find(n => n.id === r.notaId);
                  const rKey = r._fbKey;
                  return (
                    <div key={rKey || r.id} style={{ background: "#111d33", borderRadius: 8, padding: "8px 10px", marginBottom: 3, border: "1px solid #1e2d48", display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
                          {eq?.nome} - {eq?.enc} <span style={{ color: "#5a7aa0", fontSize: 9 }}>· {(r.data || "").split("-").reverse().join("/")}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#f97316", fontWeight: 600 }}>{r.motivo}</div>
                        {r.pontoNome && <div style={{ fontSize: 9, color: "#3b9eff" }}>Ponto: {r.pontoNome}</div>}
                        {nt && <div style={{ fontSize: 9, color: "#5a7aa0" }}>Nota: {nt.nome}</div>}
                        {r.obs && <div style={{ fontSize: 9, color: "#5a7aa0", fontStyle: "italic" }}>{r.obs}</div>}
                      </div>
                      <div className="m" style={{ fontSize: 13, fontWeight: 800, color: "#ef4444", flexShrink: 0 }}>{r.qtd}x</div>
                      <button onClick={() => { if (rKey) fbRemove("retrab/" + rKey); }} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 11, padding: "4px 8px", fontWeight: 700 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {screen === "retrabalho" && retForm && (() => {
        const retNota = retForm.notaId ? notas.find(n => n.id === retForm.notaId) : null;
        return (
          <div style={{ padding: "14px 14px 100px" }}>
            <button onClick={() => setRetForm(null)} style={bk}>← Voltar</button>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9", marginBottom: 14 }}>Registrar Retrabalho</h2>
            <FL label="Equipe"><select value={retForm.eqId} onChange={e => setRetForm(f => ({ ...f, eqId: e.target.value }))} style={inp}><option value="">Selecione</option>{EQUIPES.map(eq => <option key={eq.id} value={eq.id}>{eq.nome} - {eq.enc}</option>)}</select></FL>
            <FL label="Data"><input type="date" value={retForm.data} onChange={e => setRetForm(f => ({ ...f, data: e.target.value }))} style={inp} /></FL>
            <FL label="Nota / Obra">
              <input value={retNotaBusca} onChange={e => { setRetNotaBusca(e.target.value); setRetForm(f => ({ ...f, notaId: "", pontoNome: "" })); }} placeholder="🔍 Pesquisar nota..." style={inp} />
              {retNotaBusca.length > 0 && !retForm.notaId && (
                <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  {notas.filter(n => n.nome.toLowerCase().includes(retNotaBusca.toLowerCase())).map(n => (
                    <button key={n.id} onClick={() => { setRetForm(f => ({ ...f, notaId: n.id, pontoNome: "" })); setRetNotaBusca(n.nome); }} style={{ padding: "8px 10px", background: "#111d33", border: "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 11, color: "#d4dce9" }}>{n.nome}</button>
                  ))}
                  {notas.filter(n => n.nome.toLowerCase().includes(retNotaBusca.toLowerCase())).length === 0 && (
                    <div style={{ padding: 10, fontSize: 11, color: "#4b6080", textAlign: "center" }}>Nenhuma nota encontrada</div>
                  )}
                </div>
              )}
              {retForm.notaId && (
                <div style={{ marginTop: 4, padding: "6px 10px", background: "rgba(96,165,250,.08)", borderRadius: 6, border: "1px solid rgba(96,165,250,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 600 }}>{notas.find(n => n.id === retForm.notaId)?.nome}</span>
                  <button onClick={() => { setRetForm(f => ({ ...f, notaId: "", pontoNome: "" })); setRetNotaBusca(""); }} style={{ background: "none", border: "none", color: "#4b6080", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              )}
            </FL>
            {retNota && (<FL label="Ponto"><select value={retForm.pontoNome} onChange={e => setRetForm(f => ({ ...f, pontoNome: e.target.value }))} style={inp}><option value="">Selecione</option>{(retNota.pontos || []).map(p => <option key={p.id} value={p.n}>{p.n}</option>)}</select></FL>)}
            <FL label="Quantidade"><input type="number" min="1" value={retForm.qtd} onChange={e => setRetForm(f => ({ ...f, qtd: parseInt(e.target.value) || 1 }))} style={inp} /></FL>
            <FL label="Motivo"><div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{MOTIVOS_RETRAB.map(m => (<button key={m} onClick={() => setRetForm(f => ({ ...f, motivo: m }))} style={{ padding: "9px 12px", background: retForm.motivo === m ? "rgba(239,68,68,.1)" : "#111d33", border: retForm.motivo === m ? "1.5px solid rgba(239,68,68,.3)" : "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 12, fontWeight: retForm.motivo === m ? 700 : 500, color: retForm.motivo === m ? "#ef4444" : "#94a3b8" }}>{m}</button>))}</div></FL>
            <FL label="Observação"><input value={retForm.obs} onChange={e => setRetForm(f => ({ ...f, obs: e.target.value }))} placeholder="Detalhes..." style={inp} /></FL>
            <button onClick={() => { if (!retForm.eqId || !retForm.motivo) return; fbPush("retrab", retForm); setRetForm(null); }} disabled={!retForm.eqId || !retForm.motivo} style={{ width: "100%", padding: "13px 0", marginTop: 8, background: (!retForm.eqId || !retForm.motivo) ? "#1e2d48" : "linear-gradient(135deg,#ef4444,#dc2626)", color: (!retForm.eqId || !retForm.motivo) ? "#3d4d66" : "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Registrar</button>
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
                      fbSet("notas", updated.length > 0 ? updated : null);
                    }
                  }} style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 6, color: "#ef4444", cursor: "pointer", fontSize: 10, padding: "4px 8px", fontWeight: 700, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => { if (confirm("Tem certeza? Isso vai apagar TODAS as notas, atribuições, retrabalhos e cavas.")) { fbSet("notas", null); fbSet("atribs", null); fbSet("retrab", null); fbSet("cavas", null); } }} style={{ width: "100%", marginTop: 14, padding: "12px 0", background: "rgba(239,68,68,.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,.15)", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑️ Resetar Banco Completo</button>
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
      {cavaModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#111d33", borderRadius: 16, padding: 20, maxWidth: 340, width: "100%", border: "1px solid #1e2d48" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>🔧 Abertura de Cava</div>
            <div style={{ fontSize: 12, color: "#4b6080", marginBottom: 14 }}>Ponto <strong style={{ color: "#eab308" }}>{cavaModal.pontoNome}</strong> — houve cava (2 US)?</div>
            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
              {EQUIPES.map(eq => (<button key={eq.id} onClick={() => salvarCava(eq.id)} style={{ padding: "9px 12px", background: "#0b1121", border: "1px solid #1e2d48", borderRadius: 8, cursor: "pointer", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#d4dce9", display: "flex", justifyContent: "space-between" }}><span>{eq.nome} - {eq.enc}</span><span style={{ color: tipoCor(eq.tipo), fontSize: 9 }}>{eq.tipo}</span></button>))}
            </div>
            <button onClick={() => setCavaModal(null)} style={{ width: "100%", padding: "10px 0", background: "#1e2d48", color: "#94a3b8", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Não houve cava</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = { width: "100%", padding: "9px 12px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, color: "#d4dce9", fontSize: 13, boxSizing: "border-box" };
const bk = { background: "none", border: "none", color: "#60a5fa", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, padding: 0 };
function FL({ label, children }) { return (<div style={{ marginBottom: 12 }}><label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#4b6080", textTransform: "uppercase", letterSpacing: .6, marginBottom: 5 }}>{label}</label>{children}</div>); }

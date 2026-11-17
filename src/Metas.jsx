import { useState, useEffect, useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell, Legend } from "recharts";
import { db, ref, set, onValue } from "./firebase";
import { BASES } from "./data";

// ═══ METAS MENSAIS ═══
// Firebase: metas/{YYYY-MM}/{baseId} = { usRealizado, usEmergencial, equipesAtivas, metaPorEquipe, obs, atualizadoEm }
// usEmergencial está CONTIDO em usRealizado (é a parte do total que veio de atendimentos emergenciais)
// Meta da base no mês = equipesAtivas × metaPorEquipe

const META_EQUIPE_PADRAO = 550; // 25 US/dia × 22 dias úteis
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const COR_EMERG = "#f97316";
const CORES_BASE = { "santa-rosa": "#eab308", "tres-passos": "#22d3ee", "frederico": "#a78bfa" };

const fN = (v, d = 0) => (v == null || isNaN(v) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pctCor = (p) => (p == null ? "#4b6080" : p >= 100 ? "#22c55e" : p >= 90 ? "#eab308" : "#ef4444");
const mesKey = (ano, m) => `${ano}-${String(m + 1).padStart(2, "0")}`;

function calcLinha(d) {
  if (!d || d.usRealizado == null || d.usRealizado === "") return null;
  const us = Number(d.usRealizado) || 0;
  const eq = Number(d.equipesAtivas) || 0;
  const mpe = Number(d.metaPorEquipe) || META_EQUIPE_PADRAO;
  const meta = eq * mpe;
  const em = Math.min(Number(d.usEmergencial) || 0, us);
  return { us, em, usProg: us - em, pctEm: us > 0 ? (em / us) * 100 : 0, eq, mpe, meta, pct: meta > 0 ? (us / meta) * 100 : null, usEq: eq > 0 ? us / eq : null, gap: us - meta };
}

function somaBases(porBase) {
  const linhas = Object.values(porBase).map(calcLinha).filter(Boolean);
  if (!linhas.length) return null;
  const us = linhas.reduce((s, l) => s + l.us, 0);
  const eq = linhas.reduce((s, l) => s + l.eq, 0);
  const meta = linhas.reduce((s, l) => s + l.meta, 0);
  const em = linhas.reduce((s, l) => s + l.em, 0);
  return { us, em, usProg: us - em, pctEm: us > 0 ? (em / us) * 100 : 0, eq, mpe: eq > 0 ? meta / eq : null, meta, pct: meta > 0 ? (us / meta) * 100 : null, usEq: eq > 0 ? us / eq : null, gap: us - meta, parcial: linhas.length < BASES.length, nBases: linhas.length };
}

export default function Metas({ role, baseSel }) {
  const isCoord = role === "coordenador";
  const podeEditar = role === "gestor" || role === "coordenador";
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [visao, setVisao] = useState(isCoord ? "consolidado" : baseSel);
  const [raw, setRaw] = useState({});
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { if (!isCoord && baseSel) setVisao(baseSel); }, [baseSel, isCoord]);
  useEffect(() => onValue(ref(db, "metas"), (s) => setRaw(s.val() || {})), []);

  const linhas = useMemo(() => MESES_ABREV.map((abrev, m) => {
    const k = mesKey(ano, m);
    const porBase = raw[k] || {};
    const l = visao === "consolidado" ? somaBases(porBase) : calcLinha(porBase[visao]);
    const extra = {};
    if (visao === "consolidado") BASES.forEach((b) => { const lb = calcLinha(porBase[b.id]); extra["pct_" + b.id] = lb?.pct != null ? Math.round(lb.pct * 10) / 10 : null; });
    return { m, k, mes: abrev, ...(l || {}), vazio: !l, ...extra };
  }), [raw, ano, visao]);

  const preenchidos = linhas.filter((l) => !l.vazio);
  const acum = useMemo(() => {
    if (!preenchidos.length) return null;
    const us = preenchidos.reduce((s, l) => s + l.us, 0);
    const meta = preenchidos.reduce((s, l) => s + l.meta, 0);
    const eqMed = preenchidos.reduce((s, l) => s + l.eq, 0) / preenchidos.length;
    const em = preenchidos.reduce((s, l) => s + l.em, 0);
    return { us, em, pctEm: us > 0 ? (em / us) * 100 : 0, meta, pct: meta > 0 ? (us / meta) * 100 : null, eqMed, mesesBatidos: preenchidos.filter((l) => l.pct >= 100).length };
  }, [preenchidos]);
  const ultimo = preenchidos[preenchidos.length - 1];

  const abrirForm = (m, baseId) => {
    if (!podeEditar) return;
    const b = baseId || (visao === "consolidado" ? BASES[0].id : visao);
    const k = mesKey(ano, m);
    const atual = raw[k]?.[b];
    // sugere meta/equipes do mês anterior preenchido
    let ant = null;
    Object.keys(raw).filter((kk) => kk < k && raw[kk]?.[b]).sort().forEach((kk) => { ant = raw[kk][b]; });
    setForm({
      m, baseId: b,
      usRealizado: atual?.usRealizado ?? "",
      usEmergencial: atual?.usEmergencial ?? "",
      equipesAtivas: atual?.equipesAtivas ?? ant?.equipesAtivas ?? "",
      metaPorEquipe: atual?.metaPorEquipe ?? ant?.metaPorEquipe ?? META_EQUIPE_PADRAO,
      obs: atual?.obs ?? "",
      existe: !!atual,
    });
  };

  const salvar = async () => {
    const f = form;
    const num = (v) => Number(String(v).replace(",", "."));
    if (f.usRealizado === "" || f.equipesAtivas === "") { alert("Preencha US realizado e equipes ativas."); return; }
    if (f.usEmergencial !== "" && num(f.usEmergencial) > num(f.usRealizado)) { alert("As US de emergencial não podem ser maiores que o total realizado no mês."); return; }
    await set(ref(db, `metas/${mesKey(ano, f.m)}/${f.baseId}`), {
      usRealizado: Number(String(f.usRealizado).replace(",", ".")),
      usEmergencial: f.usEmergencial === "" ? 0 : Number(String(f.usEmergencial).replace(",", ".")),
      equipesAtivas: Number(String(f.equipesAtivas).replace(",", ".")),
      metaPorEquipe: Number(String(f.metaPorEquipe).replace(",", ".")) || META_EQUIPE_PADRAO,
      obs: f.obs || "",
      atualizadoEm: new Date().toISOString(),
      atualizadoPor: role,
    });
    setForm(null);
    setMsg("✅ Fechamento salvo!");
    setTimeout(() => setMsg(""), 2500);
  };

  const excluir = async () => {
    if (!window.confirm || !window.confirm("Excluir o fechamento deste mês?")) return;
    await set(ref(db, `metas/${mesKey(ano, form.m)}/${form.baseId}`), null);
    setForm(null);
  };

  const nomeVisao = visao === "consolidado" ? "Consolidado (SR + TP + FW)" : BASES.find((b) => b.id === visao)?.nome;
  const card = { background: "linear-gradient(135deg,rgba(13,24,41,.85),rgba(17,29,51,.65))", border: "1px solid rgba(255,255,255,.05)", borderRadius: 14, padding: "12px 14px" };
  const lbl = { fontSize: 9, color: "#5a7aa0", fontWeight: 700, textTransform: "uppercase", letterSpacing: .6 };

  const TT = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    if (p.vazio) return null;
    return (
      <div style={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
        <div style={{ fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>{MESES_NOME[p.m]} {ano}</div>
        <div style={{ color: "#eab308" }}>Realizado: <b>{fN(p.us, 1)} US</b></div>
        {p.em > 0 && <div style={{ color: "#94a3b8", paddingLeft: 8 }}>Programado: {fN(p.usProg, 1)} · <span style={{ color: COR_EMERG }}>Emergencial: {fN(p.em, 1)} ({fN(p.pctEm, 1)}%)</span></div>}
        <div style={{ color: "#94a3b8" }}>Meta: {fN(p.meta, 1)} US ({fN(p.eq)} eq × {fN(p.mpe, 0)})</div>
        <div style={{ color: pctCor(p.pct), fontWeight: 800 }}>{fN(p.pct, 1)}% da meta</div>
        {p.parcial && <div style={{ color: "#f97316", fontSize: 9, marginTop: 2 }}>⚠ Nem todas as bases lançadas</div>}
      </div>
    );
  };

  return (
    <div className="resp-content fade-in" style={{ padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#f1f5f9" }}>🎯 Metas Mensais</h2>
          <div style={{ fontSize: 10, color: "#5a7aa0" }}>{nomeVisao}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setAno(ano - 1)} style={navBtn}>←</button>
          <div className="m" style={{ padding: "6px 12px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, color: "#eab308", fontSize: 13, fontWeight: 800 }}>{ano}</div>
          <button onClick={() => setAno(ano + 1)} style={navBtn}>→</button>
        </div>
      </div>

      {isCoord && (
        <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
          {[{ id: "consolidado", sigla: "Consolidado" }, ...BASES].map((b) => (
            <button key={b.id} onClick={() => setVisao(b.id)} style={{ flex: "1 0 auto", padding: "8px 10px", borderRadius: 8, border: "1px solid " + (visao === b.id ? "#eab308" : "#1e2d48"), background: visao === b.id ? "rgba(234,179,8,.12)" : "#111d33", color: visao === b.id ? "#eab308" : "#5a7aa0", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>{b.sigla}</button>
          ))}
        </div>
      )}

      {msg && <div style={{ padding: "8px 12px", marginBottom: 10, background: msg.startsWith("✅") ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)", color: msg.startsWith("✅") ? "#22c55e" : "#ef4444", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{msg}</div>}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 12 }}>
        <div style={card}>
          <div style={lbl}>Acumulado {ano}</div>
          <div className="m" style={{ fontSize: 22, fontWeight: 800, color: pctCor(acum?.pct) }}>{acum ? fN(acum.pct, 1) + "%" : "—"}</div>
          <div style={{ fontSize: 10, color: "#5a7aa0" }}>{acum ? `${fN(acum.us)} / ${fN(acum.meta)} US` : "Sem lançamentos"}</div>
        </div>
        <div style={card}>
          <div style={lbl}>Último mês ({ultimo ? MESES_ABREV[ultimo.m] : "—"})</div>
          <div className="m" style={{ fontSize: 22, fontWeight: 800, color: pctCor(ultimo?.pct) }}>{ultimo ? fN(ultimo.pct, 1) + "%" : "—"}</div>
          <div style={{ fontSize: 10, color: ultimo?.gap >= 0 ? "#22c55e" : "#ef4444" }}>{ultimo ? (ultimo.gap >= 0 ? "+" : "") + fN(ultimo.gap) + " US vs meta" : ""}</div>
          {ultimo?.parcial && <div style={{ fontSize: 9, color: "#f97316", fontWeight: 700 }}>⚠ só {ultimo.nBases} de {BASES.length} bases lançadas</div>}
        </div>
        <div style={card}>
          <div style={lbl}>US por equipe ({ultimo ? MESES_ABREV[ultimo.m] : "—"})</div>
          <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>{ultimo ? fN(ultimo.usEq, 1) : "—"}</div>
          <div style={{ fontSize: 10, color: "#5a7aa0" }}>{ultimo ? `meta ${fN(ultimo.mpe, 0)} · ${fN(ultimo.eq)} equipes` : ""}</div>
        </div>
        <div style={card}>
          <div style={lbl}>Meses com meta batida</div>
          <div className="m" style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>{acum ? `${acum.mesesBatidos}/${preenchidos.length}` : "—"}</div>
          <div style={{ fontSize: 10, color: "#5a7aa0" }}>{acum ? `média ${fN(acum.eqMed, 1)} equipes ativas` : ""}</div>
        </div>
        <div style={card}>
          <div style={lbl}>Emergencial ({ultimo ? MESES_ABREV[ultimo.m] : "—"})</div>
          <div className="m" style={{ fontSize: 22, fontWeight: 800, color: COR_EMERG }}>{ultimo ? fN(ultimo.em, 1) : "—"}</div>
          <div style={{ fontSize: 10, color: "#5a7aa0" }}>{ultimo ? `${fN(ultimo.pctEm, 1)}% do realizado · ano ${fN(acum.em)} US (${fN(acum.pctEm, 1)}%)` : ""}</div>
        </div>
      </div>

      {/* Gráfico Realizado × Meta */}
      <div style={{ ...card, marginBottom: 12, padding: "12px 6px 4px" }}>
        <div style={{ ...lbl, paddingLeft: 8, marginBottom: 6 }}>Realizado × Meta (US)</div>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={linhas} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#5a7aa0" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#5a7aa0" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} />
            <Tooltip content={<TT />} cursor={{ fill: "rgba(234,179,8,.05)" }} />
            <Bar dataKey="usProg" name="Programado" stackId="r" barSize={22} onClick={(d) => visao !== "consolidado" && abrirForm(d.m)} style={{ cursor: podeEditar && visao !== "consolidado" ? "pointer" : "default" }}>
              {linhas.map((l) => <Cell key={l.k} fill={pctCor(l.pct)} fillOpacity={0.85} />)}
            </Bar>
            <Bar dataKey="em" name="Emergencial" stackId="r" fill={COR_EMERG} radius={[5, 5, 0, 0]} barSize={22} onClick={(d) => visao !== "consolidado" && abrirForm(d.m)} />
            <Line dataKey="meta" name="Meta" stroke="#f1f5f9" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: "#f1f5f9" }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 9, color: "#5a7aa0", paddingBottom: 6 }}>
          <span><span style={{ color: "#22c55e" }}>■</span> ≥100%</span>
          <span><span style={{ color: "#eab308" }}>■</span> 90–99%</span>
          <span><span style={{ color: "#ef4444" }}>■</span> &lt;90%</span>
          <span><span style={{ color: COR_EMERG }}>■</span> Emergencial</span>
          <span>– – Meta</span>
        </div>
      </div>

      {/* Gráfico % atingimento */}
      <div style={{ ...card, marginBottom: 12, padding: "12px 6px 4px" }}>
        <div style={{ ...lbl, paddingLeft: 8, marginBottom: 6 }}>{visao === "consolidado" ? "% da meta por base" : "% da meta e US por equipe"}</div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={linhas} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#5a7aa0" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="p" tick={{ fontSize: 9, fill: "#5a7aa0" }} axisLine={false} tickLine={false} unit="%" domain={[0, (max) => Math.max(120, Math.ceil(max / 10) * 10)]} />
            {visao !== "consolidado" && <YAxis yAxisId="e" orientation="right" tick={{ fontSize: 9, fill: "#5a7aa0" }} axisLine={false} tickLine={false} />}
            <Tooltip contentStyle={{ background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#f1f5f9", fontWeight: 800 }} formatter={(v, n) => [n.includes("%") || n.startsWith("SR") || n.startsWith("TP") || n.startsWith("FW") ? fN(v, 1) + "%" : fN(v, 1), n]} />
            <ReferenceLine yAxisId="p" y={100} stroke="#22c55e" strokeDasharray="4 4" />
            {visao === "consolidado"
              ? BASES.map((b) => <Line key={b.id} yAxisId="p" dataKey={"pct_" + b.id} name={b.sigla} stroke={CORES_BASE[b.id]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)
              : <>
                  <Bar yAxisId="e" dataKey="usEq" name="US/equipe" fill="#3b82f6" fillOpacity={0.35} radius={[4, 4, 0, 0]} barSize={16} />
                  <Line yAxisId="p" dataKey="pct" name="% meta" stroke="#eab308" strokeWidth={2.5} dot={{ r: 3, fill: "#eab308" }} connectNulls />
                </>}
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela mensal */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 12 }}>
        <div style={{ ...lbl, padding: "10px 12px 6px" }}>Fechamentos {ano} {podeEditar && <span style={{ textTransform: "none", color: "#4b6080", fontWeight: 600 }}>· toque no mês para lançar/editar</span>}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "#5a7aa0", fontSize: 9, textTransform: "uppercase" }}>
                {["Mês", "Equipes", "Meta/eq", "Meta US", "Realizado", "Emerg.", "%", "Dif."].map((h) => <th key={h} style={{ padding: "6px 8px", textAlign: h === "Mês" ? "left" : "right", fontWeight: 700, borderBottom: "1px solid #1e2d48" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.k} onClick={() => visao !== "consolidado" && abrirForm(l.m)} style={{ cursor: podeEditar && visao !== "consolidado" ? "pointer" : "default", borderBottom: "1px solid #131f36", opacity: l.vazio ? 0.45 : 1 }}>
                  <td style={{ padding: "7px 8px", fontWeight: 700, color: "#d4dce9" }}>{MESES_ABREV[l.m]}{l.parcial && <span title="Nem todas as bases lançadas" style={{ color: "#f97316" }}> *</span>}</td>
                  <td className="m" style={td}>{l.vazio ? "" : fN(l.eq)}</td>
                  <td className="m" style={td}>{l.vazio ? "" : fN(l.mpe, 0)}</td>
                  <td className="m" style={td}>{l.vazio ? "" : fN(l.meta)}</td>
                  <td className="m" style={{ ...td, color: "#f1f5f9", fontWeight: 700 }}>{l.vazio ? (podeEditar && visao !== "consolidado" ? <span style={{ color: "#eab308" }}>+ lançar</span> : "—") : fN(l.us, 1)}</td>
                  <td className="m" style={{ ...td, color: COR_EMERG }}>{l.vazio ? "" : fN(l.em, 1)}</td>
                  <td className="m" style={{ ...td, color: pctCor(l.pct), fontWeight: 800 }}>{l.vazio ? "" : fN(l.pct, 1) + "%"}</td>
                  <td className="m" style={{ ...td, color: l.gap >= 0 ? "#22c55e" : "#ef4444" }}>{l.vazio ? "" : (l.gap >= 0 ? "+" : "") + fN(l.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visao === "consolidado" && <div style={{ padding: "8px 12px", fontSize: 9, color: "#4b6080" }}>Para lançar, selecione uma base acima. * = nem todas as bases lançaram o mês.</div>}
      </div>

      {/* Modal lançamento */}
      {form && (
        <div onClick={() => setForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#0f1a2e", border: "1px solid rgba(234,179,8,.2)", borderRadius: 16, padding: 18, width: "100%", maxWidth: 380 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f1f5f9", marginBottom: 2 }}>Fechamento de {MESES_NOME[form.m]} {ano}</div>
            <div style={{ fontSize: 11, color: "#eab308", fontWeight: 700, marginBottom: 14 }}>{BASES.find((b) => b.id === form.baseId)?.nome}</div>
            <Campo label="US realizado no mês (total)">
              <input type="number" inputMode="decimal" autoFocus value={form.usRealizado} onChange={(e) => setForm({ ...form, usRealizado: e.target.value })} style={inp} placeholder="ex: 9850" />
            </Campo>
            <Campo label="Dessas, US de atendimento emergencial">
              <input type="number" inputMode="decimal" value={form.usEmergencial} onChange={(e) => setForm({ ...form, usEmergencial: e.target.value })} style={{ ...inp, borderColor: "rgba(249,115,22,.35)" }} placeholder="ex: 1200 (deixe vazio se não houve)" />
            </Campo>
            <div style={{ display: "flex", gap: 8 }}>
              <Campo label="Equipes ativas" style={{ flex: 1 }}>
                <input type="number" inputMode="decimal" step="0.5" value={form.equipesAtivas} onChange={(e) => setForm({ ...form, equipesAtivas: e.target.value })} style={inp} placeholder="ex: 18" />
              </Campo>
              <Campo label="Meta por equipe (US)" style={{ flex: 1 }}>
                <input type="number" inputMode="decimal" value={form.metaPorEquipe} onChange={(e) => setForm({ ...form, metaPorEquipe: e.target.value })} style={inp} />
              </Campo>
            </div>
            {(() => {
              const prev = calcLinha({ usRealizado: form.usRealizado || 0, equipesAtivas: form.equipesAtivas, metaPorEquipe: form.metaPorEquipe });
              if (!prev || !form.equipesAtivas) return null;
              return (
                <div style={{ padding: "10px 12px", background: "#0b1121", borderRadius: 10, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: "#5a7aa0" }}>Meta do mês<div className="m" style={{ fontSize: 14, color: "#f1f5f9", fontWeight: 800 }}>{fN(prev.meta)} US</div></div>
                  {form.usRealizado !== "" && <div className="m" style={{ fontSize: 20, fontWeight: 900, color: pctCor(prev.pct) }}>{fN(prev.pct, 1)}%</div>}
                </div>
              );
            })()}
            <Campo label="Observação (opcional)">
              <input value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} style={inp} placeholder="ex: 2 equipes paradas por chuva" />
            </Campo>
            <button onClick={salvar} className="btn-primary" style={{ width: "100%", padding: "11px 0", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 6 }}>💾 Salvar fechamento</button>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setForm(null)} style={{ flex: 1, padding: "9px 0", background: "#1e2d48", color: "#94a3b8", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
              {form.existe && <button onClick={excluir} style={{ flex: 1, padding: "9px 0", background: "rgba(239,68,68,.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Excluir</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#4b6080", textTransform: "uppercase", letterSpacing: .6, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const inp = { width: "100%", padding: "9px 12px", background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, color: "#d4dce9", fontSize: 13, boxSizing: "border-box" };
const td = { padding: "7px 8px", textAlign: "right", color: "#94a3b8" };
const navBtn = { width: 30, height: 32, background: "#1a2540", border: "1px solid #2d3d56", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 700 };

import React from "react";
import Papa from "papaparse";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { DateRange } from "react-date-range";
import { ptBR } from "date-fns/locale";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "./App.css";

// =========================
// LINKS REAIS (CSV PUBLICADO)
// =========================
const CONSOLIDADO_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSZRl3o2rQ1ksZd237nE_ZO3GDdigVsaHQw18SSCS-h6ozLp_Z57W-beKNqU7ZOJcr184Mdy1RElhLk/pub?gid=0&single=true&output=csv";

const INVESTIMENTO_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSZRl3o2rQ1ksZd237nE_ZO3GDdigVsaHQw18SSCS-h6ozLp_Z57W-beKNqU7ZOJcr184Mdy1RElhLk/pub?gid=814167914&single=true&output=csv";

// =========================
// CONFIG UI
// =========================
const ALL_CHANNELS = ["Site", "Dream Team", "Marketplace", "Social"];
const DONUT_COLORS = ["#22c55e", "#22d3ee", "#a855f7", "#f97316"];

// =========================
// HELPERS
// =========================
const normalizeKey = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_");

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const formatDateBR = (date) =>
  date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatShortBR = (date) =>
  date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

const parseNumberBR = (v) => {
  if (v === null || v === undefined) return 0;
  let s = String(v).trim();
  if (!s) return 0;

  // remove moeda/espacos
  s = s.replace(/[R$\s]/g, "");

  // se vier 1.234,56 -> 1234.56
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma && !hasDot) s = s.replace(",", ".");

  // limpa lixo
  s = s.replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const parseDateAny = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // dd/mm/aaaa ou dd/mm/aa
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(s)) {
    const [dd, mm, yy] = s.split("/").map((x) => parseInt(x, 10));
    const yyyy = yy < 100 ? 2000 + yy : yy;
    const dt = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // dd/mm (assume 2025)
  if (/^\d{2}\/\d{2}$/.test(s)) {
    const [dd, mm] = s.split("/").map((x) => parseInt(x, 10));
    const dt = new Date(2025, mm - 1, dd);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const safeDiv = (a, b) => (b ? a / b : 0);

// pega a 1ª coluna que existir no CSV (muito útil quando o nome muda)
const pickColumn = (row, candidates) => {
  const keys = Object.keys(row || {});
  // tenta por normalização
  for (const c of candidates) {
    const cc = normalizeKey(c);
    // match exato por key normalizada
    for (const k of keys) {
      if (normalizeKey(k) === cc) return row[k];
    }
  }
  // tenta match por "contém"
  for (const c of candidates) {
    const cc = normalizeKey(c);
    for (const k of keys) {
      if (normalizeKey(k).includes(cc)) return row[k];
    }
  }
  return undefined;
};

// =========================
// LABEL FORA DA ROSQUINHA (linha + %)
// =========================
const RADIAN = Math.PI / 180;
const renderOutsideLabel = ({ cx, cy, midAngle, outerRadius, percent, payload }) => {
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const textAnchor = x > cx ? "start" : "end";
  const percText = `${(percent * 100).toFixed(1)}%`;
  const canal = payload?.canal ?? "";

  return (
    <text
      x={x}
      y={y}
      fill="#e5e7eb"
      textAnchor={textAnchor}
      dominantBaseline="central"
      fontSize={11}
    >
      <tspan x={x} dy={-4} fontWeight={600}>
        {percText}
      </tspan>
      <tspan x={x} dy={14} fill="#9ca3af">
        {canal}
      </tspan>
    </text>
  );
};

export default function App() {
  // filtros topo
  const [periodo, setPeriodo] = React.useState("custom"); // "7d" | "custom"
  const [showDatePicker, setShowDatePicker] = React.useState(false);

  const [showChannelPicker, setShowChannelPicker] = React.useState(false);
  const [selectedChannels, setSelectedChannels] = React.useState([...ALL_CHANNELS]);

  const [range, setRange] = React.useState([
    {
      startDate: new Date(2025, 10, 11),
      endDate: new Date(2025, 10, 19),
      key: "selection",
    },
  ]);

  // dados
  const [rowsConsolidado, setRowsConsolidado] = React.useState([]); // data+canal
  const [rowsInvest, setRowsInvest] = React.useState([]); // data
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const labelPeriodo =
    range[0]?.startDate && range[0]?.endDate
      ? `${formatDateBR(range[0].startDate)} - ${formatDateBR(range[0].endDate)}`
      : "Selecionar período";

  // =========================
  // LOAD CSVs
  // =========================
  const loadCSVs = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const parseRemote = (url) =>
        new Promise((resolve, reject) => {
          Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (result) => resolve(result.data || []),
            error: (err) => reject(err),
          });
        });

      const [rawCons, rawInv] = await Promise.all([
        parseRemote(CONSOLIDADO_CSV_URL),
        parseRemote(INVESTIMENTO_CSV_URL),
      ]);

      // CONSOLIDADO: data, canal, pedidos, faturamento
      const cons = rawCons
        .map((r) => {
          const dataRaw = pickColumn(r, ["data", "dia", "date"]);
          const canalRaw = pickColumn(r, ["canal", "channel", "origem", "fonte"]);
          const pedidosRaw = pickColumn(r, ["pedidos", "orders", "qtd_pedidos", "qtd pedidos"]);
          const faturamentoRaw = pickColumn(r, ["faturamento", "receita", "revenue", "vendas", "valor"]);

          const date = parseDateAny(dataRaw);
          const canal = String(canalRaw ?? "").trim();

          if (!date || !canal) return null;

          return {
            date: startOfDay(date),
            dateKey: startOfDay(date).getTime(),
            dataLabel: formatShortBR(date),
            dataFull: formatDateBR(date),
            canal,
            pedidos: Math.round(parseNumberBR(pedidosRaw)),
            faturamento: parseNumberBR(faturamentoRaw),
          };
        })
        .filter(Boolean);

      // INVESTIMENTO: data, investimento_total, clientes_novos (opcional)
      const inv = rawInv
        .map((r) => {
          const dataRaw = pickColumn(r, ["data", "dia", "date"]);
          const investimentoRaw = pickColumn(r, [
            "investimento_total",
            "investimento total",
            "investimento",
            "midia",
            "gasto",
            "spend",
          ]);
          const novosRaw = pickColumn(r, [
            "clientes_novos",
            "clientes novos",
            "novos_clientes",
            "new_customers",
            "clientes",
          ]);

          const date = parseDateAny(dataRaw);
          if (!date) return null;

          return {
            date: startOfDay(date),
            dateKey: startOfDay(date).getTime(),
            dataLabel: formatShortBR(date),
            dataFull: formatDateBR(date),
            investimento_total: parseNumberBR(investimentoRaw),
            clientes_novos: Math.round(parseNumberBR(novosRaw)),
          };
        })
        .filter(Boolean);

      setRowsConsolidado(cons);
      setRowsInvest(inv);

      // se estiver vindo canal com variação de caixa etc, tenta casar com os 4 oficiais
      // (mantém os oficiais como filtro padrão)
      const channelsInData = Array.from(new Set(cons.map((x) => x.canal)));
      const mapped = channelsInData
        .map((c) => {
          const lc = c.toLowerCase();
          const found = ALL_CHANNELS.find((o) => o.toLowerCase() === lc);
          return found || null;
        })
        .filter(Boolean);

      if (mapped.length) setSelectedChannels([...new Set(mapped)]);
      else setSelectedChannels([...ALL_CHANNELS]);
    } catch (e) {
      setError(e?.message || "Erro ao carregar CSVs.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCSVs();
  }, [loadCSVs]);

  // =========================
  // FILTROS: data + canais
  // =========================
  const selectedSet = React.useMemo(() => new Set(selectedChannels), [selectedChannels]);

  const effectiveRange = React.useMemo(() => {
    // custom
    let start = range[0]?.startDate ? startOfDay(range[0].startDate) : null;
    let end = range[0]?.endDate ? endOfDay(range[0].endDate) : null;

    if (periodo === "7d") {
      // últimos 7 dias com base no consolidado (se não tiver, usa investimento)
      const keys = rowsConsolidado.length
        ? rowsConsolidado.map((r) => r.dateKey)
        : rowsInvest.map((r) => r.dateKey);

      if (keys.length) {
        const sorted = [...new Set(keys)].sort((a, b) => a - b);
        const last = sorted[sorted.length - 1];
        const endDate = new Date(last);
        const startDate = new Date(last);
        startDate.setDate(startDate.getDate() - 6);
        start = startOfDay(startDate);
        end = endOfDay(endDate);
      }
    }

    return { start, end };
  }, [periodo, range, rowsConsolidado, rowsInvest]);

  const inRange = React.useCallback(
    (d) => {
      const { start, end } = effectiveRange;
      if (!start || !end) return true;
      const t = d.getTime();
      return t >= start.getTime() && t <= end.getTime();
    },
    [effectiveRange]
  );

  const consolidadoFiltrado = React.useMemo(() => {
    return rowsConsolidado.filter((r) => inRange(r.date) && selectedSet.has(r.canal));
  }, [rowsConsolidado, inRange, selectedSet]);

  const investFiltrado = React.useMemo(() => {
    return rowsInvest.filter((r) => inRange(r.date));
  }, [rowsInvest, inRange]);

  // =========================
  // SERIES (LINHAS)
  // =========================
  const dailySeries = React.useMemo(() => {
    const map = new Map(); // dateKey -> agg
    for (const r of consolidadoFiltrado) {
      const k = r.dateKey;
      if (!map.has(k)) map.set(k, { dateKey: k, data: r.dataLabel, faturamento: 0, pedidos: 0, investimento: 0 });
      const cur = map.get(k);
      cur.faturamento += r.faturamento;
      cur.pedidos += r.pedidos;
    }

    // junta investimento total do dia
    for (const inv of investFiltrado) {
      const k = inv.dateKey;
      if (!map.has(k)) map.set(k, { dateKey: k, data: inv.dataLabel, faturamento: 0, pedidos: 0, investimento: 0 });
      const cur = map.get(k);
      cur.investimento += inv.investimento_total;
    }

    return Array.from(map.values()).sort((a, b) => a.dateKey - b.dateKey);
  }, [consolidadoFiltrado, investFiltrado]);

  // =========================
  // DONUTS (por canal)
  // =========================
  const donutFaturamento = React.useMemo(() => {
    const by = new Map();
    for (const ch of selectedChannels) by.set(ch, 0);
    for (const r of consolidadoFiltrado) by.set(r.canal, (by.get(r.canal) || 0) + r.faturamento);

    return Array.from(by.entries())
      .map(([canal, faturamento]) => ({ canal, faturamento }))
      .filter((x) => x.faturamento > 0);
  }, [consolidadoFiltrado, selectedChannels]);

  const donutPedidos = React.useMemo(() => {
    const by = new Map();
    for (const ch of selectedChannels) by.set(ch, 0);
    for (const r of consolidadoFiltrado) by.set(r.canal, (by.get(r.canal) || 0) + r.pedidos);

    return Array.from(by.entries())
      .map(([canal, pedidos]) => ({ canal, pedidos }))
      .filter((x) => x.pedidos > 0);
  }, [consolidadoFiltrado, selectedChannels]);

  // =========================
  // KPIs
  // =========================
  const totals = React.useMemo(() => {
    const faturamento_total = consolidadoFiltrado.reduce((s, r) => s + r.faturamento, 0);
    const pedidos_total = consolidadoFiltrado.reduce((s, r) => s + r.pedidos, 0);
    const investimento_total = investFiltrado.reduce((s, r) => s + r.investimento_total, 0);
    const clientes_novos = investFiltrado.reduce((s, r) => s + (r.clientes_novos || 0), 0);

    const ticket_medio = safeDiv(faturamento_total, pedidos_total);
    const cac = safeDiv(investimento_total, clientes_novos); // se clientes_novos não existir, vira 0
    const cpa = safeDiv(investimento_total, pedidos_total);
    const roi_percent = investimento_total ? ((faturamento_total - investimento_total) / investimento_total) * 100 : 0;

    return {
      faturamento_total,
      pedidos_total,
      investimento_total,
      clientes_novos,
      ticket_medio,
      cac,
      cpa,
      roi_percent,
    };
  }, [consolidadoFiltrado, investFiltrado]);

  const kpis = React.useMemo(() => {
    // variações mockadas por enquanto (até você criar período anterior)
    const mockVar = { fat: 8.9, pedidos: 7.1, ticket: 1.7, invest: -3.4, cac: -11.1, cpa: -9.8, roi: 80.2 };

    return [
      { id: "fat", label: "Faturamento", valor: `R$ ${totals.faturamento_total.toLocaleString("pt-BR")}`, variacao: mockVar.fat },
      { id: "pedidos", label: "Pedidos", valor: totals.pedidos_total.toLocaleString("pt-BR"), variacao: mockVar.pedidos },
      { id: "ticket", label: "Ticket Médio", valor: `R$ ${totals.ticket_medio.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`, variacao: mockVar.ticket },
      { id: "invest", label: "Investimento", valor: `R$ ${totals.investimento_total.toLocaleString("pt-BR")}`, variacao: mockVar.invest },
      { id: "cac", label: "CAC", valor: `R$ ${totals.cac.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`, variacao: mockVar.cac },
      { id: "cpa", label: "CPA", valor: `R$ ${totals.cpa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`, variacao: mockVar.cpa },
      { id: "roi", label: "ROI", valor: `${totals.roi_percent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, variacao: mockVar.roi },
    ];
  }, [totals]);

  // =========================
  // TABELA
  // =========================
  const tableData = React.useMemo(() => {
    return [...consolidadoFiltrado]
      .sort((a, b) => a.dateKey - b.dateKey || a.canal.localeCompare(b.canal))
      .map((r) => ({
        data: r.dataFull,
        canal: r.canal,
        pedidos: r.pedidos,
        faturamento: r.faturamento,
      }));
  }, [consolidadoFiltrado]);

  // =========================
  // MULTISELECT CANAIS
  // =========================
  const toggleChannel = (ch) => {
    setSelectedChannels((prev) => {
      const set = new Set(prev);
      if (set.has(ch)) set.delete(ch);
      else set.add(ch);
      // não deixa vazio
      if (set.size === 0) return prev;
      return Array.from(set);
    });
  };

  // fecha popovers clicando fora
  React.useEffect(() => {
    const onDoc = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (!t.closest(".date-picker-wrapper")) setShowDatePicker(false);
      if (!t.closest(".channel-picker-wrapper")) setShowChannelPicker(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <div className="logo-area">
          <div className="logo">VX</div>
          <div>
            <h1>VX Case</h1>
            <p>Dashboard de Performance</p>
          </div>
        </div>

        <div className="filters">
          <button
            className={"filter-btn " + (periodo === "7d" ? "filter-btn-active" : "")}
            onClick={() => {
              setPeriodo("7d");
              setShowDatePicker(false);
            }}
          >
            Últimos 7 dias
          </button>

          <div className="date-picker-wrapper">
            <button
              className={"filter-btn " + (periodo === "custom" ? "filter-btn-active" : "")}
              onClick={() => setShowDatePicker((p) => !p)}
            >
              {labelPeriodo}
            </button>

            {showDatePicker && (
              <div className="date-picker-popover">
                <DateRange
                  ranges={range}
                  onChange={(item) => {
                    setRange([item.selection]);
                    setPeriodo("custom");
                  }}
                  moveRangeOnFirstSelection={false}
                  months={1}
                  direction="vertical"
                  showDateDisplay={false}
                  rangeColors={["#22c55e"]}
                  locale={ptBR}
                />
              </div>
            )}
          </div>

          <div className="channel-picker-wrapper">
            <button
              className={"filter-btn " + (showChannelPicker ? "filter-btn-active" : "")}
              onClick={() => setShowChannelPicker((p) => !p)}
            >
              Canais
            </button>

            {showChannelPicker && (
              <div className="channel-picker-popover">
                <div className="channel-picker-head">
                  <span className="channel-picker-title">Selecionar canais</span>
                  <button className="channel-mini-btn" onClick={() => setSelectedChannels([...ALL_CHANNELS])}>
                    Todos
                  </button>
                </div>

                <div className="channel-picker-list">
                  {ALL_CHANNELS.map((ch) => (
                    <label key={ch} className="channel-item">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                      />
                      <span>{ch}</span>
                    </label>
                  ))}
                </div>

                <div className="channel-picker-foot">
                  <button className="channel-close-btn" onClick={() => setShowChannelPicker(false)}>
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>

          <button className="reload-btn" onClick={loadCSVs} title="Recarregar dados">
            ⟳
          </button>
        </div>
      </header>

      <main className="main">
        {error ? (
          <div className="table-card">
            <h2>Erro</h2>
            <p style={{ color: "#fca5a5", fontSize: 12, whiteSpace: "pre-wrap" }}>{error}</p>
            <div style={{ marginTop: 10 }}>
              <button className="reload-btn" onClick={loadCSVs}>
                Tentar novamente
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="table-card">
            <h2>Carregando...</h2>
            <p style={{ color: "#9ca3af", fontSize: 12 }}>Lendo dados do Google Sheets (CSV).</p>
          </div>
        ) : (
          <>
            {/* KPI */}
            <section className="kpi-grid">
              {kpis.map((kpi) => {
                const positive = kpi.variacao >= 0;
                return (
                  <div key={kpi.id} className="kpi-card">
                    <span className="kpi-label">{kpi.label}</span>
                    <div className="kpi-value">{kpi.valor}</div>
                    <div className={"kpi-variation " + (positive ? "kpi-up" : "kpi-down")}>
                      {positive ? "↑" : "↓"} {Math.abs(kpi.variacao).toFixed(1)}% vs período anterior
                    </div>
                  </div>
                );
              })}
            </section>

            {/* LINHAS */}
            <section className="charts-row">
              <div className="chart-card">
                <h2>Faturamento Diário</h2>
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                      <XAxis dataKey="data" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip formatter={(v) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, "Faturamento"]} />
                      <Line type="monotone" dataKey="faturamento" stroke="#22c55e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h2>Investimento em Mídia Diário</h2>
                <div className="chart-wrapper">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                      <XAxis dataKey="data" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip formatter={(v) => [`R$ ${Number(v).toLocaleString("pt-BR")}`, "Investimento"]} />
                      <Line type="monotone" dataKey="investimento" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* ROSQUINHAS LADO A LADO */}
            <section className="chart-full">
              <div className="chart-card">
                <h2>Participação por Canal (Faturamento)</h2>
                <div className="chart-wrapper chart-wrapper-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 20, right: 2, bottom: 0, left: 0 }}>
                      <Tooltip
                        formatter={(value, _name, entry) => [
                          `R$ ${Number(value).toLocaleString("pt-BR")}`,
                          entry.payload.canal,
                        ]}
                      />
                      <Legend layout="vertical" verticalAlign="middle" align="left" iconType="circle" />
                      <Pie
                        data={donutFaturamento}
                        dataKey="faturamento"
                        nameKey="canal"
                        cx="35%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={4}
                        labelLine={{ stroke: "#4b5563", strokeWidth: 1 }}
                        label={renderOutsideLabel}
                      >
                        {donutFaturamento.map((entry, index) => (
                          <Cell key={`fat-${entry.canal}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="chart-card">
                <h2>Participação por Canal (Pedidos)</h2>
                <div className="chart-wrapper chart-wrapper-donut">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 20, right: 2, bottom: 0, left: 0 }}>
                      <Tooltip
                        formatter={(value, _name, entry) => [
                          `${Number(value).toLocaleString("pt-BR")} pedidos`,
                          entry.payload.canal,
                        ]}
                      />
                      <Legend layout="vertical" verticalAlign="middle" align="left" iconType="circle" />
                      <Pie
                        data={donutPedidos}
                        dataKey="pedidos"
                        nameKey="canal"
                        cx="35%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={4}
                        labelLine={{ stroke: "#4b5563", strokeWidth: 1 }}
                        label={renderOutsideLabel}
                      >
                        {donutPedidos.map((entry, index) => (
                          <Cell key={`ped-${entry.canal}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* TABELA */}
            <section className="table-card">
              <h2>Detalhamento (Data + Canal)</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Canal</th>
                      <th>Pedidos</th>
                      <th>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((linha, i) => (
                      <tr key={i}>
                        <td>{linha.data}</td>
                        <td>{linha.canal}</td>
                        <td>{Number(linha.pedidos).toLocaleString("pt-BR")}</td>
                        <td>R$ {Number(linha.faturamento).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ marginTop: 10, color: "#9ca3af", fontSize: 11 }}>
                * CAC depende de “clientes novos” na aba investimento. Se estiver vazio, CAC ficará 0.
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="footer">Dashboard VX Case • Dados em tempo real via Google Sheets (CSV)</footer>
    </div>
  );
}

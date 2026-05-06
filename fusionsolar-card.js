/**
 * FusionSolar Card
 * Animated Lovelace card for Huawei SUN2000 inverters via the FusionSolar / Huawei Solar integration
 *
 * Author:  robman2026
 * GitHub:  https://github.com/robman2026/fusionsolar-card
 * Version: 1.0.0
 * License: MIT
 *
 * Layout (top → bottom):
 *  1. Header        — title, subtitle, live / standby status pill
 *  2. Flow Diagram  — animated SVG (Solar · Grid · Battery · House) with glowing nodes
 *  3. Arc Gauges    — Solar | House | Grid | Battery%
 *  4. Energy Chart  — Chart.js line chart, Day / Week / Month tabs
 *  5. Summary Cards — Generated / Consumed / Exported kWh
 *  6. Self-Consumption rate bar
 *  7. Detail Sections (collapsible):
 *       Inverter · Grid & House Load · Panel Production & Forecast
 *       Self-Consumption Ratios · Diagnostics
 */

const CARD_VERSION = '1.0.0';

// ── LitElement bootstrap (same pattern as all robman2026 cards) ──────────────
const LitElement = Object.getPrototypeOf(customElements.get('ha-panel-lovelace'));
const { html, css } = LitElement.prototype;

// ── Helpers ──────────────────────────────────────────────────────────────────
function sv(hass, id)         { if (!id || !hass) return null; const e = hass.states[id]; return e ? e.state : null; }
function sn(hass, id, def=0)  { const v = sv(hass, id); return v !== null && v !== 'unavailable' && v !== 'unknown' ? (parseFloat(v) || def) : def; }
function sf(hass, id, dp=2)   { return sn(hass, id, 0).toFixed(dp); }
function sLabel(hass, id)     { const v = sv(hass, id); if (!v || v === 'unavailable' || v === 'unknown') return '—'; return v; }
function hasCfg(cfg, ...keys) { return keys.some(k => cfg[k] && cfg[k].trim && cfg[k].trim() !== ''); }

// ── Default config ────────────────────────────────────────────────────────────
function getDefaultConfig() {
  return {
    card_title:    'SUN2000 · FusionSolar',
    card_subtitle: 'Huawei inverter · Home Assistant',

    // ── Flow diagram + arc gauges ──
    solar_power_entity:      '',
    house_power_entity:      '',
    grid_power_entity:       '',
    battery_soc_entity:      '',
    self_consumption_entity: '',

    // ── Chart data ──
    production_today_entity:  '', production_week_entity:  '', production_month_entity:  '',
    consumption_today_entity: '', consumption_week_entity: '', consumption_month_entity: '',
    export_today_entity:      '', export_week_entity:      '', export_month_entity:      '',

    // ── Inverter detail ──
    show_inverter: true,
    pv1_power_entity: '', pv1_voltage_entity: '', pv1_current_entity: '',
    pv2_power_entity: '', pv2_voltage_entity: '', pv2_current_entity: '',
    phase_a_voltage_entity: '', phase_b_voltage_entity: '', phase_c_voltage_entity: '',
    grid_current_entity: '',    phase_b_current_entity: '', phase_c_current_entity: '',
    grid_frequency_entity: '',  power_factor_entity: '',
    insulation_resistance_entity: '', internal_temperature_entity: '',

    // ── Grid & House Load detail ──
    show_grid: true,
    grid_consumption_today_entity: '',    grid_consumption_week_entity: '',
    grid_consumption_month_entity: '',    grid_consumption_year_entity: '',
    grid_consumption_lifetime_entity: '',
    grid_injection_today_entity: '',      grid_injection_week_entity: '',
    grid_injection_month_entity: '',      grid_injection_year_entity: '',
    grid_injection_lifetime_entity: '',
    house_load_today_entity: '',          house_load_week_entity: '',
    house_load_month_entity: '',          house_load_year_entity: '',
    house_load_lifetime_entity: '',

    // ── Panel Production & Forecast detail ──
    show_panels: true,
    panel_production_power_entity: '',
    pv_forecasted_today_entity: '',       pv_remaining_today_entity: '',
    panel_production_today_entity: '',    panel_production_week_entity: '',
    panel_production_month_entity: '',    panel_production_year_entity: '',
    panel_production_lifetime_entity: '',
    panel_production_consumption_today_entity: '',   panel_production_consumption_week_entity: '',
    panel_production_consumption_month_entity: '',   panel_production_consumption_year_entity: '',
    panel_production_consumption_lifetime_entity: '',

    // ── Self-Consumption Ratios detail ──
    show_ratios: true,
    sc_ratio_load_today_entity: '',    sc_ratio_load_week_entity: '',
    sc_ratio_load_month_entity: '',    sc_ratio_load_year_entity: '',
    sc_ratio_load_lifetime_entity: '',
    sc_ratio_prod_today_entity: '',    sc_ratio_prod_week_entity: '',
    sc_ratio_prod_month_entity: '',    sc_ratio_prod_year_entity: '',
    sc_ratio_prod_lifetime_entity: '',

    // ── Diagnostics detail ──
    show_diagnostics: true,
    inverter_status_entity: '',      inverter_output_mode_entity: '',
    inverter_last_updated_entity: '', inverter_start_time_entity: '',
  };
}

// ── Chart.js CDN loader (injected once) ──────────────────────────────────────
let _chartJsReady = false;
let _chartJsCallbacks = [];
function loadChartJs(cb) {
  if (_chartJsReady) { cb(); return; }
  _chartJsCallbacks.push(cb);
  if (_chartJsCallbacks.length > 1) return; // already loading
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  s.onload = () => { _chartJsReady = true; _chartJsCallbacks.forEach(f => f()); _chartJsCallbacks = []; };
  document.head.appendChild(s);
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN CARD
// ════════════════════════════════════════════════════════════════════════════
class FusionSolarCard extends LitElement {

  static get properties() {
    return {
      hass:          {},
      _config:       { state: true },
      _openSections: { state: true },
      _chartRange:   { state: true },
    };
  }

  constructor() {
    super();
    this._openSections = {};
    this._chartRange   = 'day';
    this._chart        = null;
  }

  // ── Required HA methods ────────────────────────────────────────────────────
  setConfig(config) {
    if (!config) throw new Error('fusionsolar-card: missing config');
    this._config = Object.assign({}, getDefaultConfig(), config);
  }

  static getStubConfig() {
    return {
      card_title:           'SUN2000 · FusionSolar',
      card_subtitle:        'Huawei inverter · Home Assistant',
      solar_power_entity:   'sensor.panel_production_power',
      house_power_entity:   'sensor.house_load_power',
      grid_power_entity:    'sensor.grid_consumption_power',
      production_today_entity:  'sensor.panel_production_today',
      consumption_today_entity: 'sensor.house_load_today',
      export_today_entity:      'sensor.grid_injection_today',
    };
  }

  static async getConfigElement() {
    return document.createElement('fusionsolar-card-editor');
  }

  getCardSize() { return 8; }

  // ── Chart lifecycle ────────────────────────────────────────────────────────
  firstUpdated() {
    loadChartJs(() => this._buildChart());
  }

  updated(changed) {
    if (changed.has('_chartRange') || changed.has('_config')) {
      // Range or config changed — full rebuild needed
      loadChartJs(() => this._buildChart());
    } else if (changed.has('hass') && this._chart) {
      // Only entity values changed — patch in-place, no flicker
      loadChartJs(() => this._patchChart());
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  }

  // Patch existing chart data without destroying/recreating — prevents flicker
  _patchChart() {
    if (!this._chart) { this._buildChart(); return; }
    const { solar, cons, exp } = this._getChartData();
    this._chart.data.datasets[0].data = solar;
    this._chart.data.datasets[1].data = cons;
    this._chart.data.datasets[2].data = exp;
    this._chart.update('none'); // 'none' = skip animation on data patch
  }

  _getChartData() {
    const cfg  = this._config;
    const hass = this.hass;
    const r    = this._chartRange;
    let labels, solar, cons, exp;

    if (r === 'day') {
      labels = ['6h','7h','8h','9h','10h','11h','12h','13h','14h','15h','16h','17h','18h','19h'];
      const todayMax = sn(hass, cfg.production_today_entity, 0);
      const curve    = [0,0.01,0.08,0.18,0.30,0.38,0.44,0.42,0.37,0.29,0.20,0.12,0.05,0.01];
      solar = curve.map(v => +(v * todayMax * 14).toFixed(2));
      const cMax = sn(hass, cfg.consumption_today_entity, 0);
      cons  = curve.map(v => +(v * cMax * 8 + cMax * 0.03).toFixed(2));
      const eMax = sn(hass, cfg.export_today_entity, 0);
      exp   = curve.map(v => +(v * eMax * 14).toFixed(2));
    } else if (r === 'week') {
      labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const w  = sn(hass, cfg.production_week_entity, 0);
      solar    = [0.13,0.16,0.09,0.15,0.17,0.18,0.12].map(v => +(v * w).toFixed(1));
      const cw = sn(hass, cfg.consumption_week_entity, 0);
      cons     = [0.14,0.17,0.12,0.15,0.15,0.16,0.11].map(v => +(v * cw).toFixed(1));
      const ew = sn(hass, cfg.export_week_entity, 0);
      exp      = [0.12,0.16,0.06,0.14,0.18,0.20,0.14].map(v => +(v * ew).toFixed(1));
    } else {
      labels = ['Week 1','Week 2','Week 3','Week 4'];
      const m  = sn(hass, cfg.production_month_entity, 0);
      solar    = [0.22,0.28,0.21,0.29].map(v => +(v * m).toFixed(1));
      const cm = sn(hass, cfg.consumption_month_entity, 0);
      cons     = [0.23,0.26,0.23,0.28].map(v => +(v * cm).toFixed(1));
      const em = sn(hass, cfg.export_month_entity, 0);
      exp      = [0.20,0.30,0.18,0.32].map(v => +(v * em).toFixed(1));
    }
    return { labels, solar, cons, exp, r };
  }

  _buildChart() {
    const canvas = this.shadowRoot && this.shadowRoot.getElementById('fs-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const { labels, solar, cons, exp, r } = this._getChartData();

    if (this._chart) this._chart.destroy();

    this._chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'PV production', data:solar, borderColor:'#00f5ff', backgroundColor:'rgba(0,245,255,0.07)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#00f5ff', borderWidth:2 },
          { label:'Consumption',   data:cons,  borderColor:'#ff2d8f', backgroundColor:'transparent',           fill:false,tension:0.4, pointRadius:3, pointBackgroundColor:'#ff2d8f', borderWidth:2, borderDash:[5,3] },
          { label:'Grid export',   data:exp,   borderColor:'#b4ff39', backgroundColor:'rgba(180,255,57,0.06)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#b4ff39', borderWidth:2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { display:false },
          tooltip: {
            backgroundColor:'rgba(8,15,35,0.92)', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
            titleColor:'#8b949e', bodyColor:'#e6edf3',
            titleFont:{ family:'DM Mono,monospace', size:10 },
            bodyFont: { family:'DM Mono,monospace', size:11 },
            padding:10,
            callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} ${r==='day'?'kW':'kWh'}` },
          },
        },
        scales: {
          x: { grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ font:{ size:9 }, color:'#5a7090', maxRotation:0 } },
          y: { grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ font:{ size:9 }, color:'#5a7090', callback: v => v+(r==='day'?'kW':'kWh') } },
        },
      },
    });
  }

  // ── Arc gauge helper ───────────────────────────────────────────────────────
  _arcOffset(val, max) {
    const arc = 72;
    return (arc * (1 - Math.min(1, Math.max(0, val / max)))).toFixed(1);
  }

  // ── Detail section toggle ─────────────────────────────────────────────────
  _toggleSection(id) {
    this._openSections = { ...this._openSections, [id]: !this._openSections[id] };
  }

  // ── kWh tile helper ────────────────────────────────────────────────────────
  _kwTile(label, entityId, colorClass, icon='📅') {
    if (!entityId) return html``;
    const val = sf(this.hass, entityId, 2);
    return html`
      <div class="det-tile ${colorClass}">
        <span class="dt-icon">${icon}</span>
        <div>
          <div class="dt-lbl">${label}</div>
          <div class="dt-val" style="color:var(--c-${colorClass})">${val}<span class="dt-unit">kWh</span></div>
        </div>
      </div>`;
  }

  _ratioTile(label, entityId) {
    if (!entityId) return html``;
    const val = sn(this.hass, entityId, 0);
    return html`
      <div class="det-tile cb">
        <div>
          <div class="dt-lbl">${label}</div>
          <div class="dt-val" style="color:var(--c-cb)">${val.toFixed(2)}<span class="dt-unit">%</span></div>
          <div class="dt-bar"><div class="dt-bar-fill" style="width:${Math.min(100,val)}%;background:var(--c-cb)"></div></div>
        </div>
      </div>`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render() {
    const cfg  = this._config;
    const hass = this.hass;
    if (!cfg) return html``;

    const solar  = sn(hass, cfg.solar_power_entity, 0);
    const house  = sn(hass, cfg.house_power_entity, 0);
    const grid   = sn(hass, cfg.grid_power_entity,  0);
    const batSoc = cfg.battery_soc_entity ? sn(hass, cfg.battery_soc_entity, 0) : null;
    const scRate = cfg.self_consumption_entity ? sn(hass, cfg.self_consumption_entity, 0) : null;

    // Status pill from inverter_status entity or fallback to Live
    const statusRaw = cfg.inverter_status_entity ? sLabel(hass, cfg.inverter_status_entity) : 'Live';
    const isLive    = statusRaw === '—' || statusRaw.toLowerCase().includes('grid') || statusRaw === 'Live';
    const statusTxt = statusRaw === '—' ? 'Live' : statusRaw;

    // Summary values
    const genToday  = cfg.production_today_entity  ? sf(hass, cfg.production_today_entity,  1) : null;
    const consToday = cfg.consumption_today_entity ? sf(hass, cfg.consumption_today_entity, 1) : null;
    const expToday  = cfg.export_today_entity      ? sf(hass, cfg.export_today_entity,      1) : null;
    const genWeek   = cfg.production_week_entity   ? sf(hass, cfg.production_week_entity,   1) : null;
    const consWeek  = cfg.consumption_week_entity  ? sf(hass, cfg.consumption_week_entity,  1) : null;
    const expWeek   = cfg.export_week_entity       ? sf(hass, cfg.export_week_entity,       1) : null;
    const genMonth  = cfg.production_month_entity  ? sf(hass, cfg.production_month_entity,  1) : null;
    const consMonth = cfg.consumption_month_entity ? sf(hass, cfg.consumption_month_entity, 1) : null;
    const expMonth  = cfg.export_month_entity      ? sf(hass, cfg.export_month_entity,      1) : null;

    const sumGen  = this._chartRange === 'day' ? genToday  : this._chartRange === 'week' ? genWeek  : genMonth;
    const sumCons = this._chartRange === 'day' ? consToday : this._chartRange === 'week' ? consWeek : consMonth;
    const sumExp  = this._chartRange === 'day' ? expToday  : this._chartRange === 'week' ? expWeek  : expMonth;

    return html`
      <ha-card>
        <div class="fs-card">

          <!-- ── Header ── -->
          <div class="fs-header">
            <div class="fs-header-left">
              <div class="fs-brand-icon">☀️</div>
              <div>
                <div class="fs-title">${cfg.card_title || 'SUN2000 · FusionSolar'}</div>
                <div class="fs-subtitle">${cfg.card_subtitle || 'Huawei inverter · Home Assistant'}</div>
              </div>
            </div>
            <div class="fs-status-pill ${isLive ? 'live' : 'standby'}">${statusTxt}</div>
          </div>

          <!-- ── Animated Flow Diagram ── -->
          <div class="fs-flow">
            <svg viewBox="0 0 440 260" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="gls"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="glh"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="glg"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <filter id="glb"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                <marker id="ms" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#00f5ff" opacity="0.9"/></marker>
                <marker id="mg" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#b4ff39" opacity="0.9"/></marker>
                <marker id="mb" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#8b5cf6" opacity="0.9"/></marker>
                <marker id="mh" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#ff2d8f" opacity="0.9"/></marker>
              </defs>

              <!-- Solar → House -->
              <path class="fp ${solar > 0 ? '' : 'fp-idle'}" d="M128,72 Q220,50 278,130" stroke="#00f5ff" stroke-width="2.5" fill="none" marker-end="url(#ms)" opacity="0.9" filter="url(#gls)"/>
              <!-- Solar → Battery (charging) -->
              ${batSoc !== null ? html`<path class="fp fp-slow ${solar > 0.1 ? '' : 'fp-idle'}" d="M100,105 Q78,155 102,195" stroke="#8b5cf6" stroke-width="1.5" fill="none" marker-end="url(#mb)" opacity="0.7"/>` : ''}
              <!-- Grid → House -->
              <path class="fp fp-slow ${grid > 0.05 ? '' : 'fp-idle'}" d="M316,72 Q338,125 318,152" stroke="#b4ff39" stroke-width="1.5" fill="none" marker-end="url(#mh)" opacity="0.6"/>
              <!-- Battery → House -->
              ${batSoc !== null ? html`<path class="fp fp-slow ${batSoc > 10 ? '' : 'fp-idle'}" d="M138,200 Q215,222 278,170" stroke="#8b5cf6" stroke-width="1.5" fill="none" marker-end="url(#mh)" opacity="0.6"/>` : ''}

              <!-- Labels -->
              <text x="208" y="26" text-anchor="middle" font-size="9" fill="#00f5ff" opacity="0.55" font-family="DM Sans,sans-serif">Solar → House</text>
              ${batSoc !== null ? html`
                <text x="56"  y="152" text-anchor="middle" font-size="8" fill="#8b5cf6" opacity="0.45" font-family="DM Sans,sans-serif">Charging</text>
                <text x="190" y="246" text-anchor="middle" font-size="8" fill="#8b5cf6" opacity="0.40" font-family="DM Sans,sans-serif">Battery → House</text>
              ` : ''}

              <!-- Solar node -->
              <g transform="translate(80,60)" filter="url(#gls)">
                <circle r="40" fill="rgba(0,245,255,0.07)" stroke="#00f5ff" stroke-width="1.8"/>
                <text y="-10" text-anchor="middle" font-size="20">☀️</text>
                <text y="9"  text-anchor="middle" font-family="DM Mono,monospace" font-size="13" fill="#00f5ff" font-weight="500">${solar.toFixed(1)}</text>
                <text y="22" text-anchor="middle" font-size="8" fill="#6a8aaa" font-family="DM Sans,sans-serif">kW</text>
              </g>

              <!-- Grid node -->
              <g transform="translate(360,58)" filter="url(#glg)">
                <circle r="34" fill="rgba(180,255,57,0.06)" stroke="#b4ff39" stroke-width="1.8"/>
                <text y="-8" text-anchor="middle" font-size="17">⚡</text>
                <text y="9"  text-anchor="middle" font-family="DM Mono,monospace" font-size="12" fill="#b4ff39" font-weight="500">${grid.toFixed(1)}</text>
                <text y="22" text-anchor="middle" font-size="8" fill="#6a8aaa" font-family="DM Sans,sans-serif">kW</text>
              </g>

              <!-- Battery node (optional) -->
              ${batSoc !== null ? html`
                <g transform="translate(80,210)" filter="url(#glb)">
                  <circle r="34" fill="rgba(139,92,246,0.08)" stroke="#8b5cf6" stroke-width="1.8"/>
                  <text y="-8" text-anchor="middle" font-size="17">🔋</text>
                  <text y="9"  text-anchor="middle" font-family="DM Mono,monospace" font-size="12" fill="#8b5cf6" font-weight="500">${batSoc.toFixed(0)}%</text>
                  <text y="22" text-anchor="middle" font-size="8" fill="#6a8aaa" font-family="DM Sans,sans-serif">SOC</text>
                </g>
              ` : ''}

              <!-- House node -->
              <g transform="translate(310,165)" filter="url(#glh)">
                <circle r="44" fill="rgba(255,45,143,0.07)" stroke="#ff2d8f" stroke-width="2"/>
                <text y="-12" text-anchor="middle" font-size="22">🏠</text>
                <text y="10"  text-anchor="middle" font-family="DM Mono,monospace" font-size="15" fill="#ff2d8f" font-weight="500">${house.toFixed(1)}</text>
                <text y="24"  text-anchor="middle" font-size="8" fill="#6a8aaa" font-family="DM Sans,sans-serif">kW</text>
              </g>
            </svg>
          </div>

          <!-- ── Arc gauge strip ── -->
          <div class="fs-gauges">
            <div class="fs-gauge solar">
              <div class="gau-lbl">Solar</div>
              <svg class="gau-arc" width="54" height="30" viewBox="0 0 54 30">
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="#00f5ff" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="${this._arcOffset(solar, 6)}"/>
              </svg>
              <div class="gau-val" style="color:#00f5ff">${solar.toFixed(1)}<span class="gau-unit">kW</span></div>
            </div>

            <div class="fs-gauge home">
              <div class="gau-lbl">House</div>
              <svg class="gau-arc" width="54" height="30" viewBox="0 0 54 30">
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="#ff2d8f" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="${this._arcOffset(house, 5)}"/>
              </svg>
              <div class="gau-val" style="color:#ff2d8f">${house.toFixed(1)}<span class="gau-unit">kW</span></div>
            </div>

            <div class="fs-gauge grid">
              <div class="gau-lbl">Grid</div>
              <svg class="gau-arc" width="54" height="30" viewBox="0 0 54 30">
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="#b4ff39" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="${this._arcOffset(grid, 4)}"/>
              </svg>
              <div class="gau-val" style="color:#b4ff39">${grid.toFixed(1)}<span class="gau-unit">kW</span></div>
            </div>

            ${batSoc !== null ? html`
              <div class="fs-gauge bat">
                <div class="gau-lbl">Battery</div>
                <div class="gau-bat-val" style="color:#8b5cf6">${batSoc.toFixed(0)}<span class="gau-unit">%</span></div>
                <div class="gau-bat-bar"><div class="gau-bat-fill" style="width:${batSoc}%"></div></div>
              </div>
            ` : ''}
          </div>

          <!-- ── Chart ── -->
          <div class="fs-chart-wrap">
            <div class="fs-chart-header">
              <span class="fs-chart-label">Energy History</span>
              <div class="fs-tabs">
                <button class="fs-tab ${this._chartRange==='day'  ?'active':''}" @click="${()=>this._setRange('day')}">Day</button>
                <button class="fs-tab ${this._chartRange==='week' ?'active':''}" @click="${()=>this._setRange('week')}">Week</button>
                <button class="fs-tab ${this._chartRange==='month'?'active':''}" @click="${()=>this._setRange('month')}">Month</button>
              </div>
            </div>
            <div class="fs-chart-area">
              <div class="fs-legend">
                <span class="fs-leg-item"><span class="fs-leg-dot" style="background:#00f5ff"></span>PV production</span>
                <span class="fs-leg-item"><span class="fs-leg-dot" style="background:#ff2d8f"></span>Consumption</span>
                <span class="fs-leg-item"><span class="fs-leg-dot" style="background:#b4ff39"></span>Grid export</span>
              </div>
              <div class="fs-chart-canvas-wrap">
                <canvas id="fs-chart" role="img" aria-label="Energy history chart"></canvas>
              </div>
            </div>

            <!-- Summary -->
            <div class="fs-summary">
              ${sumGen  !== null ? html`<div class="fs-sum-card"><div class="fs-sum-lbl">Generated</div><div class="fs-sum-val" style="color:#00f5ff">${sumGen}<span class="fs-sum-unit">kWh</span></div></div>` : ''}
              ${sumCons !== null ? html`<div class="fs-sum-card"><div class="fs-sum-lbl">Consumed</div><div class="fs-sum-val" style="color:#ff2d8f">${sumCons}<span class="fs-sum-unit">kWh</span></div></div>` : ''}
              ${sumExp  !== null ? html`<div class="fs-sum-card"><div class="fs-sum-lbl">Exported</div><div class="fs-sum-val" style="color:#b4ff39">${sumExp}<span class="fs-sum-unit">kWh</span></div></div>` : ''}
            </div>
          </div>

          <!-- ── Self-consumption bar ── -->
          ${scRate !== null || cfg.sc_ratio_prod_today_entity ? html`
            <div class="fs-sc-row">
              <div>
                <div class="fs-sc-label">Self-consumption rate</div>
                <div class="fs-sc-bar">
                  <div class="fs-sc-fill" style="width:${Math.min(100, scRate ?? sn(hass, cfg.sc_ratio_prod_today_entity, 0))}%"></div>
                </div>
              </div>
              <div class="fs-sc-val">${(scRate ?? sn(hass, cfg.sc_ratio_prod_today_entity, 0)).toFixed(1)}%</div>
            </div>
          ` : ''}

          <!-- ── Detail Sections ── -->
          <div class="fs-details">

            <!-- Inverter -->
            ${cfg.show_inverter ? this._renderInverterSection() : ''}

            <!-- Grid & House Load -->
            ${cfg.show_grid ? this._renderGridSection() : ''}

            <!-- Panel Production & Forecast -->
            ${cfg.show_panels ? this._renderPanelsSection() : ''}

            <!-- Self-Consumption Ratios -->
            ${cfg.show_ratios ? this._renderRatiosSection() : ''}

            <!-- Diagnostics -->
            ${cfg.show_diagnostics ? this._renderDiagSection() : ''}

          </div>
        </div>
      </ha-card>
    `;
  }

  _setRange(r) {
    this._chartRange = r;
  }

  // ── Detail section renderers ───────────────────────────────────────────────

  _detSection(id, dotColor, title, content) {
    const open = !!this._openSections[id];
    return html`
      <div class="det-section ${open?'open':''}">
        <div class="det-hd" @click="${()=>this._toggleSection(id)}">
          <div class="det-title">
            <span class="det-dot" style="background:${dotColor};box-shadow:0 0 5px ${dotColor}"></span>
            <span style="color:${dotColor}">${title}</span>
          </div>
          <span class="det-arrow">▾</span>
        </div>
        <div class="det-body">${open ? content : ''}</div>
      </div>`;
  }

  _subLbl(text, color) {
    return html`<div class="det-sub-lbl" style="color:${color}">${text}</div>`;
  }

  _numTile(label, entityId, colorVar, unit, icon='') {
    if (!entityId) return html``;
    const val = sn(this.hass, entityId, 0);
    return html`
      <div class="det-tile" style="--tc:${colorVar}">
        <span class="dt-icon">${icon}</span>
        <div>
          <div class="dt-lbl">${label}</div>
          <div class="dt-val" style="color:${colorVar}">${typeof val === 'number' ? val.toFixed(unit==='MΩ'||unit==='Hz'||unit==='°C'?3:2) : val}<span class="dt-unit">${unit}</span></div>
        </div>
      </div>`;
  }

  _renderInverterSection() {
    const cfg  = this._config;
    const hass = this.hass;
    const hasPV  = hasCfg(cfg, 'pv1_power_entity','pv2_power_entity','pv1_voltage_entity','pv2_voltage_entity','pv1_current_entity','pv2_current_entity');
    const hasGrd = hasCfg(cfg, 'phase_a_voltage_entity','phase_b_voltage_entity','phase_c_voltage_entity','grid_current_entity','phase_b_current_entity','phase_c_current_entity','grid_frequency_entity','power_factor_entity','insulation_resistance_entity');
    const hasTemp= hasCfg(cfg, 'internal_temperature_entity');
    if (!hasPV && !hasGrd && !hasTemp) return html``;

    const content = html`
      ${hasPV ? html`
        ${this._subLbl('PV Strings', '#00f5ff')}
        <div class="det-grid">
          ${this._numTile('PV1 Power',   cfg.pv1_power_entity,   '#00f5ff', 'kW',  '⚡')}
          ${this._numTile('PV2 Power',   cfg.pv2_power_entity,   '#00f5ff', 'kW',  '⚡')}
          ${this._numTile('PV1 Voltage', cfg.pv1_voltage_entity, '#00f5ff', 'V',   '〰')}
          ${this._numTile('PV2 Voltage', cfg.pv2_voltage_entity, '#00f5ff', 'V',   '〰')}
          ${this._numTile('PV1 Current', cfg.pv1_current_entity, '#00f5ff', 'A',   '〜')}
          ${this._numTile('PV2 Current', cfg.pv2_current_entity, '#00f5ff', 'A',   '〜')}
        </div>
      ` : ''}
      ${hasGrd ? html`
        ${this._subLbl('Grid Connection', '#b4ff39')}
        <div class="det-grid">
          ${this._numTile('Phase A Voltage',       cfg.phase_a_voltage_entity,      '#b4ff39','V',   '⚡')}
          ${this._numTile('Phase B Voltage',       cfg.phase_b_voltage_entity,      '#b4ff39','V',   '⚡')}
          ${this._numTile('Phase C Voltage',       cfg.phase_c_voltage_entity,      '#b4ff39','V',   '⚡')}
          ${this._numTile('Grid Current',          cfg.grid_current_entity,         '#b4ff39','A',   '〜')}
          ${this._numTile('Phase B Current',       cfg.phase_b_current_entity,      '#b4ff39','A',   '〜')}
          ${this._numTile('Phase C Current',       cfg.phase_c_current_entity,      '#b4ff39','A',   '〜')}
          ${this._numTile('Grid Frequency',        cfg.grid_frequency_entity,       '#b4ff39','Hz',  '∿')}
          ${this._numTile('Power Factor',          cfg.power_factor_entity,         '#b4ff39','',    'φ')}
          ${this._numTile('Insulation Res.',       cfg.insulation_resistance_entity,'#f59e0b','MΩ',  'Ω')}
        </div>
      ` : ''}
      ${hasTemp ? html`
        ${this._subLbl('Temperature', '#f59e0b')}
        <div class="det-grid">
          ${this._numTile('Internal Temp', cfg.internal_temperature_entity, '#f59e0b', '°C', '🌡')}
        </div>
      ` : ''}
    `;
    return this._detSection('inverter', '#00f5ff', 'Inverter', content);
  }

  _renderGridSection() {
    const cfg = this._config;
    const hasCons = hasCfg(cfg,'grid_consumption_today_entity','grid_consumption_week_entity','grid_consumption_month_entity','grid_consumption_year_entity','grid_consumption_lifetime_entity');
    const hasInj  = hasCfg(cfg,'grid_injection_today_entity','grid_injection_week_entity','grid_injection_month_entity','grid_injection_year_entity','grid_injection_lifetime_entity');
    const hasHL   = hasCfg(cfg,'house_load_today_entity','house_load_week_entity','house_load_month_entity','house_load_year_entity','house_load_lifetime_entity');
    if (!hasCons && !hasInj && !hasHL) return html``;

    const content = html`
      ${hasCons ? html`
        ${this._subLbl('Grid Consumption', '#b4ff39')}
        <div class="det-grid">
          ${this._kwTile('Today',      cfg.grid_consumption_today_entity,    'cg', '📅')}
          ${this._kwTile('This Week',  cfg.grid_consumption_week_entity,     'cg', '📆')}
          ${this._kwTile('This Month', cfg.grid_consumption_month_entity,    'cg', '🗓')}
          ${this._kwTile('This Year',  cfg.grid_consumption_year_entity,     'cg', '📊')}
          ${this._kwTile('Lifetime',   cfg.grid_consumption_lifetime_entity, 'cg', '♾')}
        </div>
      ` : ''}
      ${hasInj ? html`
        ${this._subLbl('Grid Injection (Export)', '#8b5cf6')}
        <div class="det-grid">
          ${this._kwTile('Today',      cfg.grid_injection_today_entity,    'cb', '📅')}
          ${this._kwTile('This Week',  cfg.grid_injection_week_entity,     'cb', '📆')}
          ${this._kwTile('This Month', cfg.grid_injection_month_entity,    'cb', '🗓')}
          ${this._kwTile('This Year',  cfg.grid_injection_year_entity,     'cb', '📊')}
          ${this._kwTile('Lifetime',   cfg.grid_injection_lifetime_entity, 'cb', '♾')}
        </div>
      ` : ''}
      ${hasHL ? html`
        ${this._subLbl('House Load', '#ff2d8f')}
        <div class="det-grid">
          ${this._kwTile('Today',      cfg.house_load_today_entity,    'ch', '📅')}
          ${this._kwTile('This Week',  cfg.house_load_week_entity,     'ch', '📆')}
          ${this._kwTile('This Month', cfg.house_load_month_entity,    'ch', '🗓')}
          ${this._kwTile('This Year',  cfg.house_load_year_entity,     'ch', '📊')}
          ${this._kwTile('Lifetime',   cfg.house_load_lifetime_entity, 'ch', '♾')}
        </div>
      ` : ''}
    `;
    return this._detSection('grid', '#b4ff39', 'Grid & House Load', content);
  }

  _renderPanelsSection() {
    const cfg = this._config;
    const hasFore = hasCfg(cfg,'panel_production_power_entity','pv_forecasted_today_entity','pv_remaining_today_entity');
    const hasProd = hasCfg(cfg,'panel_production_today_entity','panel_production_week_entity','panel_production_month_entity','panel_production_year_entity','panel_production_lifetime_entity');
    const hasCons = hasCfg(cfg,'panel_production_consumption_today_entity','panel_production_consumption_week_entity','panel_production_consumption_month_entity','panel_production_consumption_year_entity','panel_production_consumption_lifetime_entity');
    if (!hasFore && !hasProd && !hasCons) return html``;

    const content = html`
      ${hasFore ? html`
        ${this._subLbl('Live & Forecast', '#00f5ff')}
        <div class="det-grid">
          ${this._numTile('Production Power', cfg.panel_production_power_entity, '#00f5ff', 'kW', '☀️')}
          ${cfg.pv_forecasted_today_entity ? html`
            <div class="det-tile" style="--tc:#00f5ff">
              <span class="dt-icon">🔮</span>
              <div>
                <div class="dt-lbl">Forecasted Today</div>
                <div class="dt-val" style="color:#00f5ff">${sf(this.hass, cfg.pv_forecasted_today_entity, 2)}<span class="dt-unit">kWh</span></div>
              </div>
            </div>` : ''}
          ${cfg.pv_remaining_today_entity ? html`
            <div class="det-tile" style="--tc:#00f5ff">
              <span class="dt-icon">⏳</span>
              <div>
                <div class="dt-lbl">Remaining Today</div>
                <div class="dt-val" style="color:#00f5ff">${sf(this.hass, cfg.pv_remaining_today_entity, 2)}<span class="dt-unit">kWh</span></div>
              </div>
            </div>` : ''}
        </div>
      ` : ''}
      ${hasProd ? html`
        ${this._subLbl('Production History', '#00f5ff')}
        <div class="det-grid">
          ${this._kwTile('Today',      cfg.panel_production_today_entity,    'cs', '📅')}
          ${this._kwTile('This Week',  cfg.panel_production_week_entity,     'cs', '📆')}
          ${this._kwTile('This Month', cfg.panel_production_month_entity,    'cs', '🗓')}
          ${this._kwTile('This Year',  cfg.panel_production_year_entity,     'cs', '📊')}
          ${this._kwTile('Lifetime',   cfg.panel_production_lifetime_entity, 'cs', '♾')}
        </div>
      ` : ''}
      ${hasCons ? html`
        ${this._subLbl('Production → Self-Consumed', '#ff2d8f')}
        <div class="det-grid">
          ${this._kwTile('Today',      cfg.panel_production_consumption_today_entity,    'ch', '📅')}
          ${this._kwTile('This Week',  cfg.panel_production_consumption_week_entity,     'ch', '📆')}
          ${this._kwTile('This Month', cfg.panel_production_consumption_month_entity,    'ch', '🗓')}
          ${this._kwTile('This Year',  cfg.panel_production_consumption_year_entity,     'ch', '📊')}
          ${this._kwTile('Lifetime',   cfg.panel_production_consumption_lifetime_entity, 'ch', '♾')}
        </div>
      ` : ''}
    `;
    return this._detSection('panels', '#00f5ff', 'Panel Production & Forecast', content);
  }

  _renderRatiosSection() {
    const cfg = this._config;
    const hasLoad = hasCfg(cfg,'sc_ratio_load_today_entity','sc_ratio_load_week_entity','sc_ratio_load_month_entity','sc_ratio_load_year_entity','sc_ratio_load_lifetime_entity');
    const hasProd = hasCfg(cfg,'sc_ratio_prod_today_entity','sc_ratio_prod_week_entity','sc_ratio_prod_month_entity','sc_ratio_prod_year_entity','sc_ratio_prod_lifetime_entity');
    if (!hasLoad && !hasProd) return html``;

    const content = html`
      ${hasLoad ? html`
        ${this._subLbl('By Load', '#8b5cf6')}
        <div class="det-grid">
          ${this._ratioTile('Today',      cfg.sc_ratio_load_today_entity)}
          ${this._ratioTile('This Week',  cfg.sc_ratio_load_week_entity)}
          ${this._ratioTile('This Month', cfg.sc_ratio_load_month_entity)}
          ${this._ratioTile('This Year',  cfg.sc_ratio_load_year_entity)}
          ${this._ratioTile('Lifetime',   cfg.sc_ratio_load_lifetime_entity)}
        </div>
      ` : ''}
      ${hasProd ? html`
        ${this._subLbl('By Production', '#8b5cf6')}
        <div class="det-grid">
          ${this._ratioTile('Today',      cfg.sc_ratio_prod_today_entity)}
          ${this._ratioTile('This Week',  cfg.sc_ratio_prod_week_entity)}
          ${this._ratioTile('This Month', cfg.sc_ratio_prod_month_entity)}
          ${this._ratioTile('This Year',  cfg.sc_ratio_prod_year_entity)}
          ${this._ratioTile('Lifetime',   cfg.sc_ratio_prod_lifetime_entity)}
        </div>
      ` : ''}
    `;
    return this._detSection('ratios', '#8b5cf6', 'Self-Consumption Ratios', content);
  }

  _renderDiagSection() {
    const cfg = this._config;
    if (!hasCfg(cfg,'inverter_status_entity','inverter_output_mode_entity','inverter_last_updated_entity','inverter_start_time_entity')) return html``;

    const content = html`
      <div class="det-grid">
        ${cfg.inverter_status_entity ? html`
          <div class="det-tile" style="--tc:#94a3b8">
            <div>
              <div class="dt-lbl">Status</div>
              <div class="dt-val"><span class="dt-badge">${sLabel(this.hass, cfg.inverter_status_entity)}</span></div>
            </div>
          </div>` : ''}
        ${cfg.inverter_output_mode_entity ? html`
          <div class="det-tile" style="--tc:#94a3b8">
            <div>
              <div class="dt-lbl">Output Mode</div>
              <div class="dt-val" style="color:#94a3b8;font-size:11px">${sLabel(this.hass, cfg.inverter_output_mode_entity)}</div>
            </div>
          </div>` : ''}
        ${cfg.inverter_last_updated_entity ? html`
          <div class="det-tile" style="--tc:#94a3b8">
            <div>
              <div class="dt-lbl">Last Updated</div>
              <div class="dt-val" style="color:#94a3b8;font-size:11px">${sLabel(this.hass, cfg.inverter_last_updated_entity)}</div>
            </div>
          </div>` : ''}
        ${cfg.inverter_start_time_entity ? html`
          <div class="det-tile" style="--tc:#94a3b8">
            <div>
              <div class="dt-lbl">Start Time</div>
              <div class="dt-val" style="color:#94a3b8;font-size:11px">${sLabel(this.hass, cfg.inverter_start_time_entity)}</div>
            </div>
          </div>` : ''}
      </div>
    `;
    return this._detSection('diag', '#94a3b8', 'Diagnostics', content);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  static get styles() {
    return css`
      :host { display: block; }
      ha-card { background: transparent !important; box-shadow: none !important; border: none !important; }

      /* ── Card shell ── */
      .fs-card {
        background: rgba(4,10,24,0.82);
        backdrop-filter: blur(28px) saturate(160%);
        -webkit-backdrop-filter: blur(28px) saturate(160%);
        border: 1px solid rgba(0,245,255,0.14);
        border-radius: 20px;
        padding: 1.25rem;
        font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
        color: #ddeeff;
        box-shadow: 0 0 0 0.5px rgba(0,245,255,0.06) inset, 0 32px 64px rgba(0,0,0,0.65);
      }

      /* ── Header ── */
      .fs-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1.1rem; flex-wrap:wrap; gap:8px; }
      .fs-header-left { display:flex; align-items:center; gap:10px; }
      .fs-brand-icon { width:30px; height:30px; background:rgba(0,245,255,0.08); border:1px solid rgba(0,245,255,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; box-shadow:0 0 12px rgba(0,245,255,0.15); }
      .fs-title    { font-size:13px; font-weight:600; letter-spacing:0.07em; text-transform:uppercase; color:rgba(221,238,255,0.8); }
      .fs-subtitle { font-size:10px; color:rgba(106,138,170,0.7); margin-top:1px; }
      .fs-status-pill { display:flex; align-items:center; gap:6px; font-size:11px; padding:4px 11px; border-radius:20px; }
      .fs-status-pill::before { content:''; width:6px; height:6px; border-radius:50%; animation:fspulse 2s infinite; }
      .fs-status-pill.live    { color:#b4ff39; background:rgba(180,255,57,0.07); border:1px solid rgba(180,255,57,0.18); }
      .fs-status-pill.live::before    { background:#b4ff39; box-shadow:0 0 5px #b4ff39; }
      .fs-status-pill.standby { color:#94a3b8; background:rgba(148,163,184,0.07); border:1px solid rgba(148,163,184,0.18); }
      .fs-status-pill.standby::before { background:#94a3b8; }
      @keyframes fspulse { 0%,100%{opacity:1} 50%{opacity:0.25} }

      /* ── Flow diagram ── */
      .fs-flow { position:relative; height:260px; }
      .fs-flow svg { width:100%; height:100%; }
      .fp      { stroke-dasharray:8 4; animation:fsdash 1.6s linear infinite; }
      .fp-slow { animation-duration:2.5s; }
      .fp-idle { animation:none; opacity:0.18; }
      @keyframes fsdash { to { stroke-dashoffset:-24; } }

      /* ── Arc gauges ── */
      .fs-gauges { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin-top:1rem; }
      .fs-gauge { background:rgba(3,8,20,0.52); backdrop-filter:blur(14px); border:1px solid rgba(0,245,255,0.07); border-radius:11px; padding:0.6rem 0.3rem 0.5rem; text-align:center; position:relative; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.25); }
      .fs-gauge::after { content:''; position:absolute; top:0; left:0; right:0; height:2px; border-radius:11px 11px 0 0; }
      .fs-gauge.solar::after { background:#00f5ff; box-shadow:0 0 7px #00f5ff; }
      .fs-gauge.home::after  { background:#ff2d8f; box-shadow:0 0 7px #ff2d8f; }
      .fs-gauge.grid::after  { background:#b4ff39; box-shadow:0 0 7px #b4ff39; }
      .fs-gauge.bat::after   { background:#8b5cf6; box-shadow:0 0 7px #8b5cf6; }
      .gau-lbl  { font-size:9px; color:#6a8aaa; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:4px; }
      .gau-arc  { display:block; margin:0 auto 3px; }
      .gau-val  { font-family:'DM Mono',monospace; font-size:14px; font-weight:500; line-height:1; }
      .gau-unit { font-size:9px; color:#6a8aaa; margin-left:1px; }
      .gau-bat-val { font-family:'DM Mono',monospace; font-size:17px; font-weight:500; height:30px; display:flex; align-items:center; justify-content:center; }
      .gau-bat-bar  { width:80%; margin:3px auto 0; height:3px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden; }
      .gau-bat-fill { height:100%; background:#8b5cf6; border-radius:2px; box-shadow:0 0 5px #8b5cf6; }

      /* ── Chart ── */
      .fs-chart-wrap   { margin-top:1rem; }
      .fs-chart-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.55rem; }
      .fs-chart-label  { font-size:10px; color:#6a8aaa; text-transform:uppercase; letter-spacing:0.06em; }
      .fs-tabs { display:flex; gap:3px; background:rgba(10,18,34,0.55); backdrop-filter:blur(10px); border-radius:7px; padding:3px; border:1px solid rgba(0,245,255,0.07); }
      .fs-tab  { font-size:10px; font-weight:500; padding:3px 10px; border-radius:5px; cursor:pointer; border:none; background:transparent; color:#6a8aaa; font-family:inherit; transition:all .15s; }
      .fs-tab.active { background:rgba(255,255,255,0.09); color:#ddeeff; border:1px solid rgba(0,245,255,0.14); }
      .fs-chart-area { background:rgba(2,6,16,0.42); backdrop-filter:blur(18px); border:1px solid rgba(0,245,255,0.07); border-radius:13px; padding:0.9rem; }
      .fs-legend { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:0.6rem; }
      .fs-leg-item { display:flex; align-items:center; gap:5px; font-size:10px; color:#6a8aaa; }
      .fs-leg-dot  { width:8px; height:8px; border-radius:50%; }
      .fs-chart-canvas-wrap { position:relative; width:100%; height:155px; }
      canvas { width:100% !important; height:100% !important; }

      /* ── Summary ── */
      .fs-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-top:6px; }
      .fs-sum-card { background:rgba(3,8,20,0.52); border:1px solid rgba(0,245,255,0.07); border-radius:9px; padding:0.55rem 0.4rem; text-align:center; }
      .fs-sum-lbl  { font-size:9px; color:#6a8aaa; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:3px; }
      .fs-sum-val  { font-family:'DM Mono',monospace; font-size:15px; font-weight:500; }
      .fs-sum-unit { font-size:9px; color:#6a8aaa; }

      /* ── Self-consumption bar ── */
      .fs-sc-row  { margin-top:0.7rem; background:rgba(3,8,20,0.52); border:1px solid rgba(0,245,255,0.07); border-radius:11px; padding:0.7rem 0.9rem; display:flex; justify-content:space-between; align-items:center; }
      .fs-sc-label{ font-size:11px; color:#6a8aaa; }
      .fs-sc-val  { font-family:'DM Mono',monospace; font-size:16px; color:#00f5ff; text-shadow:0 0 10px rgba(0,245,255,0.4); }
      .fs-sc-bar  { height:3px; background:rgba(255,255,255,0.08); border-radius:2px; margin-top:4px; overflow:hidden; width:110px; }
      .fs-sc-fill { height:100%; background:#00f5ff; border-radius:2px; box-shadow:0 0 5px #00f5ff; transition:width 0.6s; }

      /* ── Detail sections ── */
      .fs-details { margin-top:0.85rem; }
      .det-section { background:rgba(3,8,20,0.52); border:1px solid rgba(0,245,255,0.07); border-radius:12px; margin-bottom:7px; overflow:hidden; }
      .det-hd { display:flex; align-items:center; justify-content:space-between; padding:9px 12px; cursor:pointer; user-select:none; transition:background .15s; }
      .det-hd:hover { background:rgba(0,245,255,0.03); }
      .det-title { display:flex; align-items:center; gap:8px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; }
      .det-dot   { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
      .det-arrow { color:#6a8aaa; font-size:10px; transition:transform .2s; }
      .det-section.open .det-arrow { transform:rotate(180deg); }
      .det-body  { display:none; padding:0 10px 10px; }
      .det-section.open .det-body { display:block; }

      .det-sub-lbl { font-size:8px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#6a8aaa; margin:10px 0 6px 2px; display:flex; align-items:center; gap:5px; }
      .det-sub-lbl::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.05); }

      .det-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:5px; }
      .det-tile { background:rgba(2,6,16,0.42); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:7px 9px; display:flex; align-items:center; gap:7px; position:relative; overflow:hidden; }
      .det-tile::before { content:''; position:absolute; top:0; left:0; right:0; height:1.5px; border-radius:8px 8px 0 0; background:var(--tc,#94a3b8); box-shadow:0 0 4px var(--tc,#94a3b8); }

      /* color class aliases for kwTile */
      --c-cs: #00f5ff; --c-cg: #b4ff39; --c-ch: #ff2d8f; --c-cb: #8b5cf6; --c-cw: #f59e0b;

      .dt-lbl  { font-size:8px; color:#6a8aaa; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .dt-val  { font-family:'DM Mono',monospace; font-size:13px; font-weight:500; line-height:1; }
      .dt-unit { font-size:8px; color:#6a8aaa; margin-left:1px; }
      .dt-icon { font-size:13px; flex-shrink:0; }
      .dt-bar  { height:2px; border-radius:1px; background:rgba(255,255,255,0.07); margin-top:3px; overflow:hidden; }
      .dt-bar-fill { height:100%; border-radius:1px; transition:width 0.6s; }
      .dt-badge { display:inline-block; font-size:9px; font-weight:500; padding:2px 7px; border-radius:5px; background:rgba(0,245,255,0.1); border:1px solid rgba(0,245,255,0.18); color:#00f5ff; white-space:nowrap; }

      /* ── Responsive ── */
      @media (max-width: 480px) {
        .fs-gauges { grid-template-columns: repeat(2,1fr); }
        .fs-flow   { height:210px; }
        .fs-summary{ grid-template-columns: repeat(3,1fr); }
        .det-grid  { grid-template-columns: 1fr 1fr; }
        .fs-card   { padding:0.9rem; border-radius:16px; }
      }
      @media (max-width: 340px) {
        .fs-gauges { grid-template-columns: repeat(2,1fr); }
        .det-grid  { grid-template-columns: 1fr; }
        .fs-summary{ grid-template-columns: 1fr 1fr; }
      }
    `;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// VISUAL EDITOR  (same LitElement + ha-entity-picker pattern as kitchen-card)
// ════════════════════════════════════════════════════════════════════════════
class FusionSolarCardEditor extends LitElement {
  static get properties() {
    return { hass:{}, _config:{ state:true }, _openSections:{ state:true } };
  }

  constructor() {
    super();
    this._openSections = { header:true, flow:true };
  }

  async firstUpdated() {
    const t = setTimeout(() => this.requestUpdate(), 3000);
    try {
      if (!customElements.get('ha-entity-picker')) {
        const helpers = await window.loadCardHelpers();
        const c = await helpers.createCardElement({ type:'entities', entities:[] });
        await c.constructor.getConfigElement();
      }
    } catch(_) {}
    clearTimeout(t);
    this.requestUpdate();
  }

  setConfig(config) {
    this._config = Object.assign({}, getDefaultConfig(), config || {});
  }

  _fire() {
    const ev = new Event('config-changed', { bubbles:true, composed:true });
    ev.detail = { config: this._config };
    this.dispatchEvent(ev);
  }

  _set(key, val) { this._config = { ...this._config, [key]:val }; this._fire(); }
  _toggleSec(id) { this._openSections = { ...this._openSections, [id]: !this._openSections[id] }; }

  _txt(label, value, onChange, placeholder) {
    return html`<div class="ed-field"><label class="ed-label">${label}</label>
      <input class="ed-input" type="text" .value="${value||''}" placeholder="${placeholder||''}" @change="${e=>onChange(e.target.value)}"/>
    </div>`;
  }

  _toggle(label, checked, onChange) {
    return html`<div class="toggle-row"><span class="toggle-label">${label}</span>
      <label class="toggle-wrap">
        <input type="checkbox" .checked="${!!checked}" @change="${e=>onChange(e.target.checked)}"/>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  }

  _ep(value, onChange, domains, label) {
    return html`<div class="ed-field"><label class="ed-label">${label||'Entity'}</label>
      <ha-entity-picker .hass=${this.hass} .value=${value||''} .includeDomains=${domains&&domains.length?domains:undefined}
        allow-custom-entity @value-changed=${e=>{ const v=e.detail.value||''; if(v!==(value||''))onChange(v); }}>
      </ha-entity-picker>
    </div>`;
  }

  _grp(text) { return html`<p class="hint-group">${text}</p>`; }

  _section(id, title, content) {
    const open = !!this._openSections[id];
    return html`<div class="ed-section ${open?'open':''}">
      <div class="ed-section-header" @click="${()=>this._toggleSec(id)}">
        <div class="ed-section-title">${title}</div>
        <span class="ed-section-arrow">▾</span>
      </div>
      <div class="ed-section-body">${open?content:''}</div>
    </div>`;
  }

  render() {
    if (!this._config) return html``;
    const c = this._config;
    return html`<div class="ed-root">

      ${this._section('header', '☀️ Header', html`
        ${this._txt('Card Title',    c.card_title,    v=>this._set('card_title',v),    'SUN2000 · FusionSolar')}
        ${this._txt('Card Subtitle', c.card_subtitle, v=>this._set('card_subtitle',v), 'Huawei inverter · Home Assistant')}
      `)}

      ${this._section('flow', '⚡ Flow Diagram & Chart', html`
        <p class="hint">Power the flow diagram, arc gauges and chart.</p>
        ${this._ep(c.solar_power_entity,  v=>this._set('solar_power_entity',v),  ['sensor'],'☀️ Solar / PV Production Power (kW)')}
        ${this._ep(c.house_power_entity,  v=>this._set('house_power_entity',v),  ['sensor'],'🏠 House Load Power (kW)')}
        ${this._ep(c.grid_power_entity,   v=>this._set('grid_power_entity',v),   ['sensor'],'⚡ Grid Consumption Power (kW)')}
        ${this._ep(c.battery_soc_entity,  v=>this._set('battery_soc_entity',v),  ['sensor'],'🔋 Battery State of Charge % — optional')}
        ${this._ep(c.self_consumption_entity,v=>this._set('self_consumption_entity',v),['sensor'],'% Self-Consumption Rate — optional')}
        ${this._grp('Chart — Day')}
        ${this._ep(c.production_today_entity,  v=>this._set('production_today_entity',v),  ['sensor'],'PV Production Today (kWh)')}
        ${this._ep(c.consumption_today_entity, v=>this._set('consumption_today_entity',v), ['sensor'],'House Consumption Today (kWh)')}
        ${this._ep(c.export_today_entity,      v=>this._set('export_today_entity',v),      ['sensor'],'Grid Export Today (kWh)')}
        ${this._grp('Chart — Week')}
        ${this._ep(c.production_week_entity,  v=>this._set('production_week_entity',v),  ['sensor'],'PV Production This Week')}
        ${this._ep(c.consumption_week_entity, v=>this._set('consumption_week_entity',v), ['sensor'],'House Consumption This Week')}
        ${this._ep(c.export_week_entity,      v=>this._set('export_week_entity',v),      ['sensor'],'Grid Export This Week')}
        ${this._grp('Chart — Month')}
        ${this._ep(c.production_month_entity,  v=>this._set('production_month_entity',v),  ['sensor'],'PV Production This Month')}
        ${this._ep(c.consumption_month_entity, v=>this._set('consumption_month_entity',v), ['sensor'],'House Consumption This Month')}
        ${this._ep(c.export_month_entity,      v=>this._set('export_month_entity',v),      ['sensor'],'Grid Export This Month')}
      `)}

      ${this._section('inverter', '🔌 Inverter Detail', html`
        ${this._toggle('Show Inverter section',c.show_inverter,v=>this._set('show_inverter',v))}
        ${this._grp('PV Strings')}
        ${this._ep(c.pv1_power_entity,   v=>this._set('pv1_power_entity',v),   ['sensor'],'PV1 Power (kW)')}
        ${this._ep(c.pv1_voltage_entity, v=>this._set('pv1_voltage_entity',v), ['sensor'],'PV1 Voltage (V)')}
        ${this._ep(c.pv1_current_entity, v=>this._set('pv1_current_entity',v), ['sensor'],'PV1 Current (A)')}
        ${this._ep(c.pv2_power_entity,   v=>this._set('pv2_power_entity',v),   ['sensor'],'PV2 Power (kW)')}
        ${this._ep(c.pv2_voltage_entity, v=>this._set('pv2_voltage_entity',v), ['sensor'],'PV2 Voltage (V)')}
        ${this._ep(c.pv2_current_entity, v=>this._set('pv2_current_entity',v), ['sensor'],'PV2 Current (A)')}
        ${this._grp('Grid Connection')}
        ${this._ep(c.phase_a_voltage_entity,      v=>this._set('phase_a_voltage_entity',v),      ['sensor'],'Phase A Voltage (V)')}
        ${this._ep(c.phase_b_voltage_entity,      v=>this._set('phase_b_voltage_entity',v),      ['sensor'],'Phase B Voltage (V)')}
        ${this._ep(c.phase_c_voltage_entity,      v=>this._set('phase_c_voltage_entity',v),      ['sensor'],'Phase C Voltage (V)')}
        ${this._ep(c.grid_current_entity,         v=>this._set('grid_current_entity',v),         ['sensor'],'Grid Current (A)')}
        ${this._ep(c.phase_b_current_entity,      v=>this._set('phase_b_current_entity',v),      ['sensor'],'Phase B Current (A)')}
        ${this._ep(c.phase_c_current_entity,      v=>this._set('phase_c_current_entity',v),      ['sensor'],'Phase C Current (A)')}
        ${this._ep(c.grid_frequency_entity,       v=>this._set('grid_frequency_entity',v),       ['sensor'],'Grid Frequency (Hz)')}
        ${this._ep(c.power_factor_entity,         v=>this._set('power_factor_entity',v),         ['sensor'],'Power Factor')}
        ${this._ep(c.insulation_resistance_entity,v=>this._set('insulation_resistance_entity',v),['sensor'],'Insulation Resistance (MΩ)')}
        ${this._grp('Temperature')}
        ${this._ep(c.internal_temperature_entity, v=>this._set('internal_temperature_entity',v), ['sensor'],'Internal Temperature (°C)')}
      `)}

      ${this._section('grid', '🌐 Grid & House Load', html`
        ${this._toggle('Show Grid & House Load section',c.show_grid,v=>this._set('show_grid',v))}
        ${this._grp('Grid Consumption History')}
        ${this._ep(c.grid_consumption_today_entity,    v=>this._set('grid_consumption_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.grid_consumption_week_entity,     v=>this._set('grid_consumption_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.grid_consumption_month_entity,    v=>this._set('grid_consumption_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.grid_consumption_year_entity,     v=>this._set('grid_consumption_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.grid_consumption_lifetime_entity, v=>this._set('grid_consumption_lifetime_entity',v), ['sensor'],'Lifetime')}
        ${this._grp('Grid Injection (Export) History')}
        ${this._ep(c.grid_injection_today_entity,    v=>this._set('grid_injection_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.grid_injection_week_entity,     v=>this._set('grid_injection_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.grid_injection_month_entity,    v=>this._set('grid_injection_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.grid_injection_year_entity,     v=>this._set('grid_injection_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.grid_injection_lifetime_entity, v=>this._set('grid_injection_lifetime_entity',v), ['sensor'],'Lifetime')}
        ${this._grp('House Load History')}
        ${this._ep(c.house_load_today_entity,    v=>this._set('house_load_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.house_load_week_entity,     v=>this._set('house_load_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.house_load_month_entity,    v=>this._set('house_load_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.house_load_year_entity,     v=>this._set('house_load_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.house_load_lifetime_entity, v=>this._set('house_load_lifetime_entity',v), ['sensor'],'Lifetime')}
      `)}

      ${this._section('panels', '☀️ Panel Production & Forecast', html`
        ${this._toggle('Show Panel Production section',c.show_panels,v=>this._set('show_panels',v))}
        ${this._grp('Live & Forecast')}
        ${this._ep(c.panel_production_power_entity, v=>this._set('panel_production_power_entity',v), ['sensor'],'Panel Production Power (kW)')}
        ${this._ep(c.pv_forecasted_today_entity,    v=>this._set('pv_forecasted_today_entity',v),    ['sensor'],'PV Forecasted Today (kWh)')}
        ${this._ep(c.pv_remaining_today_entity,     v=>this._set('pv_remaining_today_entity',v),     ['sensor'],'PV Remaining Today (kWh)')}
        ${this._grp('Production History')}
        ${this._ep(c.panel_production_today_entity,    v=>this._set('panel_production_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.panel_production_week_entity,     v=>this._set('panel_production_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.panel_production_month_entity,    v=>this._set('panel_production_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.panel_production_year_entity,     v=>this._set('panel_production_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.panel_production_lifetime_entity, v=>this._set('panel_production_lifetime_entity',v), ['sensor'],'Lifetime')}
        ${this._grp('Production → Self-Consumed')}
        ${this._ep(c.panel_production_consumption_today_entity,    v=>this._set('panel_production_consumption_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.panel_production_consumption_week_entity,     v=>this._set('panel_production_consumption_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.panel_production_consumption_month_entity,    v=>this._set('panel_production_consumption_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.panel_production_consumption_year_entity,     v=>this._set('panel_production_consumption_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.panel_production_consumption_lifetime_entity, v=>this._set('panel_production_consumption_lifetime_entity',v), ['sensor'],'Lifetime')}
      `)}

      ${this._section('ratios', '% Self-Consumption Ratios', html`
        ${this._toggle('Show Ratios section',c.show_ratios,v=>this._set('show_ratios',v))}
        ${this._grp('By Load')}
        ${this._ep(c.sc_ratio_load_today_entity,    v=>this._set('sc_ratio_load_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.sc_ratio_load_week_entity,     v=>this._set('sc_ratio_load_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.sc_ratio_load_month_entity,    v=>this._set('sc_ratio_load_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.sc_ratio_load_year_entity,     v=>this._set('sc_ratio_load_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.sc_ratio_load_lifetime_entity, v=>this._set('sc_ratio_load_lifetime_entity',v), ['sensor'],'Lifetime')}
        ${this._grp('By Production')}
        ${this._ep(c.sc_ratio_prod_today_entity,    v=>this._set('sc_ratio_prod_today_entity',v),    ['sensor'],'Today')}
        ${this._ep(c.sc_ratio_prod_week_entity,     v=>this._set('sc_ratio_prod_week_entity',v),     ['sensor'],'This Week')}
        ${this._ep(c.sc_ratio_prod_month_entity,    v=>this._set('sc_ratio_prod_month_entity',v),    ['sensor'],'This Month')}
        ${this._ep(c.sc_ratio_prod_year_entity,     v=>this._set('sc_ratio_prod_year_entity',v),     ['sensor'],'This Year')}
        ${this._ep(c.sc_ratio_prod_lifetime_entity, v=>this._set('sc_ratio_prod_lifetime_entity',v), ['sensor'],'Lifetime')}
      `)}

      ${this._section('diag', '🔧 Diagnostics', html`
        ${this._toggle('Show Diagnostics section',c.show_diagnostics,v=>this._set('show_diagnostics',v))}
        ${this._ep(c.inverter_status_entity,       v=>this._set('inverter_status_entity',v),       ['sensor'],'Inverter Status')}
        ${this._ep(c.inverter_output_mode_entity,  v=>this._set('inverter_output_mode_entity',v),  ['sensor'],'Inverter Output Mode')}
        ${this._ep(c.inverter_last_updated_entity, v=>this._set('inverter_last_updated_entity',v), ['sensor'],'Inverter Last Updated')}
        ${this._ep(c.inverter_start_time_entity,   v=>this._set('inverter_start_time_entity',v),   ['sensor'],'Inverter Start Time')}
      `)}

    </div>`;
  }

  static get styles() {
    return css`
      :host { display:block; font-family:'Segoe UI',system-ui,sans-serif; }
      .ed-root { display:flex; flex-direction:column; padding:8px 0; }
      .ed-label { display:block; font-size:12px; font-weight:500; color:var(--primary-text-color,rgba(255,255,255,.7)); margin-bottom:6px; }
      .ed-field { margin-bottom:12px; }
      .ed-input { width:100%; padding:10px 12px; font-size:14px; font-family:inherit; border:1px solid var(--divider-color,rgba(255,255,255,.1)); border-radius:8px; background:var(--secondary-background-color,rgba(255,255,255,.04)); color:var(--primary-text-color,#fff); box-sizing:border-box; }
      .ed-input:focus { outline:none; border-color:var(--primary-color,#4fa3e0); }
      .hint { font-size:12px; color:var(--secondary-text-color,rgba(255,255,255,.5)); margin:0 0 10px; line-height:1.5; }
      .hint-group { font-size:10px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--primary-color,#00f5ff); margin:10px 0 6px; }
      ha-entity-picker { display:block; width:100%; }
      .ed-section { background:var(--secondary-background-color,rgba(255,255,255,.025)); border:1px solid var(--divider-color,rgba(255,255,255,.06)); border-radius:10px; margin-bottom:10px; overflow:hidden; }
      .ed-section-header { padding:12px 14px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; transition:background .15s; }
      .ed-section-header:hover { background:rgba(255,255,255,.03); }
      .ed-section-title { font-size:14px; font-weight:500; color:var(--primary-text-color,#fff); }
      .ed-section-arrow { color:var(--secondary-text-color,rgba(255,255,255,.4)); font-size:12px; transition:transform .2s; }
      .ed-section.open .ed-section-arrow { transform:rotate(180deg); }
      .ed-section-body { padding:0 14px; }
      .ed-section.open .ed-section-body { padding:4px 14px 14px; }
      .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:6px 0; margin-bottom:10px; }
      .toggle-label { font-size:13px; color:var(--primary-text-color,rgba(255,255,255,.85)); }
      .toggle-wrap { position:relative; display:inline-block; width:40px; height:22px; }
      .toggle-wrap input { opacity:0; width:0; height:0; }
      .toggle-slider { position:absolute; inset:0; background:rgba(255,255,255,.15); border-radius:11px; transition:background .2s; cursor:pointer; }
      .toggle-slider::before { content:''; position:absolute; width:16px; height:16px; left:3px; top:3px; background:#fff; border-radius:50%; transition:transform .2s; }
      input:checked + .toggle-slider { background:var(--primary-color,#00f5ff); }
      input:checked + .toggle-slider::before { transform:translateX(18px); }
    `;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Register
// ════════════════════════════════════════════════════════════════════════════
customElements.define('fusionsolar-card',        FusionSolarCard);
customElements.define('fusionsolar-card-editor', FusionSolarCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type:             'fusionsolar-card',
  name:             'FusionSolar Card',
  description:      'Animated Lovelace dashboard for Huawei SUN2000 inverters — flow diagram · arc gauges · Chart.js history · full entity detail',
  preview:          true,
  documentationURL: 'https://github.com/robman2026/fusionsolar-card',
});

console.info(
  '%c FUSIONSOLAR-CARD %c v' + CARD_VERSION + ' ',
  'background:#00f5ff;color:#020610;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px;',
  'background:#020610;color:#00f5ff;font-weight:600;padding:2px 6px;border-radius:0 4px 4px 0;'
);

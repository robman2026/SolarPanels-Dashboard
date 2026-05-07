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

const CARD_VERSION = '1.8.0';

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
      _range:        { state: true },   // 'day' | 'month' | 'year' | 'lifetime'
      _offset:       { state: true },   // date offset: 0=current, -1=previous, etc.
      _statsData:    { state: true },   // { labels, solar, cons, exp, prodTotal, prodCons, prodGrid, consTotal, consPV, consGrid, unit }
      _statsLoading: { state: true },
    };
  }

  constructor() {
    super();
    this._openSections = {};
    this._range        = 'day';
    this._offset       = 0;
    this._statsData    = null;
    this._statsLoading = false;
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

  getCardSize() { return 10; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  firstUpdated() {
    loadChartJs(() => this._fetchStats());
  }

  updated(changed) {
    if (changed.has('_range') || changed.has('_offset') || changed.has('_config')) {
      loadChartJs(() => this._fetchStats());
    } else if (changed.has('_statsData')) {
      loadChartJs(() => this._buildChart());
    } else if (changed.has('hass') && this._chart) {
      // For today's view, refresh stats periodically so current hour stays current
      if (this._range === 'day' && this._offset === 0) {
        const nowMin = new Date().getMinutes();
        // Refresh at the start of each new hour (within first 2 minutes)
        if (nowMin <= 2 && (!this._lastHourRefresh || new Date().getHours() !== this._lastHourRefresh)) {
          this._lastHourRefresh = new Date().getHours();
          loadChartJs(() => this._fetchStats());
        } else if (this._statsData && this._statsData.isToday) {
          // Patch current hour's live value without full refetch
          this._patchTodayLiveHour();
        }
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._chart) { this._chart.destroy(); this._chart = null; }
  }

  // ── Date label for current range + offset ─────────────────────────────────
  _dateLabel() {
    const now = new Date();
    const r = this._range;
    const o = this._offset;
    const tz = (this.hass && this.hass.config && this.hass.config.time_zone) || undefined;
    const opts = tz ? { timeZone: tz } : {};
    if (r === 'day') {
      const d = new Date(now); d.setDate(d.getDate() + o);
      return d.toLocaleDateString('en-GB', { ...opts, day:'2-digit', month:'2-digit', year:'numeric' });
    }
    if (r === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth() + o, 1);
      return d.toLocaleDateString('en-GB', { ...opts, month:'long', year:'numeric' });
    }
    if (r === 'year') {
      return String(now.getFullYear() + o);
    }
    return 'All time';
  }

  // ── Date range for statistics query ───────────────────────────────────────
  _getDateRange() {
    const now   = new Date();
    const r     = this._range;
    const o     = this._offset;
    let start, end;

    if (r === 'day') {
      // We need to request the full local day in HA's timezone.
      // Strategy: always request a 28-hour UTC window centred on the local date.
      // This covers UTC+14 to UTC-12 (all possible offsets) with room to spare.
      // The slot-placement logic in _processStats handles mapping to correct hours.
      const localDate = new Date(now);
      localDate.setDate(localDate.getDate() + o);
      // Use midnight UTC of the requested day minus 14h (covers UTC+14)
      // to midnight UTC of next day plus 14h (covers UTC-14)
      start = new Date(Date.UTC(
        localDate.getFullYear(), localDate.getMonth(), localDate.getDate(),
        0, 0, 0, 0
      ) - 14 * 3600000); // 14h before UTC midnight
      end = new Date(Date.UTC(
        localDate.getFullYear(), localDate.getMonth(), localDate.getDate(),
        23, 59, 59, 999
      ) + 14 * 3600000); // 14h after UTC end-of-day
    } else if (r === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() + o, 1, 0, 0, 0, 0);
      end   = new Date(now.getFullYear(), now.getMonth() + o + 1, 0, 23, 59, 59, 999);
    } else if (r === 'year') {
      const y = now.getFullYear() + o;
      start = new Date(y, 0, 1, 0, 0, 0, 0);
      end   = new Date(y, 11, 31, 23, 59, 59, 999);
    } else {
      // lifetime — from 2000 to now
      start = new Date(2000, 0, 1);
      end   = new Date();
    }
    return { start, end };
  }

  // ── Fetch statistics from HA recorder ────────────────────────────────────
  async _fetchStats() {
    if (!this.hass || !this._config) return;
    const cfg = this._config;

    // Entities we need stats for
    const entities = [
      cfg.solar_power_entity,            // live kW
      cfg.house_power_entity,
      cfg.grid_power_entity,
      cfg.panel_production_power_entity || cfg.solar_power_entity,
      cfg.production_today_entity,       // kWh totals
      cfg.consumption_today_entity,
      cfg.export_today_entity,
      cfg.production_month_entity,
      cfg.consumption_month_entity,
      cfg.export_month_entity,
      cfg.production_year_entity || cfg.panel_production_year_entity,
      cfg.consumption_year_entity || cfg.house_load_year_entity,
      cfg.export_year_entity || cfg.grid_injection_year_entity,
      cfg.panel_production_lifetime_entity,
      cfg.house_load_lifetime_entity,
      cfg.grid_injection_lifetime_entity,
      cfg.panel_production_consumption_today_entity,
      cfg.panel_production_consumption_month_entity,
      cfg.panel_production_consumption_year_entity,
      cfg.panel_production_consumption_lifetime_entity,
      cfg.grid_consumption_today_entity,
      cfg.grid_consumption_month_entity,
      cfg.grid_consumption_year_entity,
      cfg.grid_consumption_lifetime_entity,
    ].filter(Boolean).filter((v,i,a) => a.indexOf(v) === i); // dedupe

    const r = this._range;
    const { start, end } = this._getDateRange();

    // For lifetime — use current entity states directly, no API needed
    if (r === 'lifetime') {
      const sn = (id) => { if (!id||!this.hass) return 0; const e=this.hass.states[id]; return e?parseFloat(e.state)||0:0; };
      const prodTotal = sn(cfg.panel_production_lifetime_entity);
      const prodCons  = sn(cfg.panel_production_consumption_lifetime_entity);
      const consTotal = sn(cfg.house_load_lifetime_entity);
      const consGrid  = sn(cfg.grid_consumption_lifetime_entity);
      const prodGrid  = prodTotal > 0 ? Math.max(0, prodTotal - prodCons) : sn(cfg.grid_injection_lifetime_entity);
      const consPV    = prodCons;
      this._statsData = this._buildLifetimeData(sn, cfg, { prodTotal, prodCons, prodGrid, consTotal, consPV, consGrid });
      return;
    }

    // For day — use recorder statistics_during_period for hourly breakdown
    // For month — daily breakdown; for year — monthly breakdown
    const period = r === 'day' ? 'hour' : r === 'month' ? 'day' : 'month';

    // Stat entities: prefer long-term statistics (energy sensors)
    const statIds = [
      cfg.production_today_entity,
      cfg.consumption_today_entity,
      cfg.export_today_entity,
      cfg.panel_production_consumption_today_entity,
      cfg.grid_consumption_today_entity,
    ].filter(Boolean).filter((v,i,a) => a.indexOf(v) === i);

    if (!statIds.length) {
      this._statsData = null;
      return;
    }

    this._statsLoading = true;
    try {
      const result = await this.hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: start.toISOString(),
        end_time:   end.toISOString(),
        period,
        statistic_ids: statIds,
        types: ['state', 'sum', 'change'],
      });

      this._statsData = this._processStats(result, r, start, end, cfg, new Date());
    } catch(e) {
      console.warn('[fusionsolar-card] Stats fetch failed, falling back to entity states:', e);
      this._statsData = this._fallbackData(cfg, r);
    }
    this._statsLoading = false;
  }

  // ── Process recorder statistics into chart + donut data ───────────────────
  _processStats(result, r, start, end, cfg, now) {

    // Physical maximum per hour for this inverter — any delta exceeding this
    // is a recorder anomaly (HA restart, sum recalculation) and must be discarded.
    const MAX_KWH_PER_HOUR = 6.5; // slightly above 6kW to allow rounding

    const getDeltas = (entityId) => {
      if (!entityId || !result[entityId]) return [];
      const pts = result[entityId];
      if (!pts.length) return [];

      // Prefer 'sum' (cumulative long-term stat), fall back to 'state', then 'change'
      const val = (pt) => {
        const v = pt.sum ?? pt.state ?? pt.change ?? 0;
        return parseFloat(v) || 0;
      };

      const deltas = [];
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) {
          const c = parseFloat(pts[i].change ?? 0) || 0;
          // Cap at physical max — anomalous first-point values are discarded
          deltas.push(Math.min(MAX_KWH_PER_HOUR, Math.max(0, c)));
        } else {
          const delta = val(pts[i]) - val(pts[i-1]);
          // Cap at physical max — any delta > MAX is a recorder artefact
          deltas.push(Math.min(MAX_KWH_PER_HOUR, Math.max(0, delta)));
        }
      }
      return deltas;
    };

    const solar    = getDeltas(cfg.production_today_entity);
    const cons     = getDeltas(cfg.consumption_today_entity);
    const exp      = getDeltas(cfg.export_today_entity);
    const selfCons = getDeltas(cfg.panel_production_consumption_today_entity);
    const gridCons = getDeltas(cfg.grid_consumption_today_entity);

    // Get raw stat points to extract actual local-time timestamps
    const rawPts = result[cfg.production_today_entity]
                || result[cfg.consumption_today_entity]
                || result[cfg.export_today_entity]
                || [];

    // ── Helper: convert a UTC ISO timestamp to the LOCAL hour in HA's timezone ──
    const haTimeZone = (this.hass.config && this.hass.config.time_zone) || 'UTC';
    const utcToLocalHour = (isoStr) => {
      try {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: haTimeZone,
          hour: 'numeric',
          hour12: false,
        });
        const parts = fmt.formatToParts(new Date(isoStr));
        const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
        return h === 24 ? 0 : h;
      } catch(e) {
        return new Date(isoStr).getHours();
      }
    };

    // ── Helper: get current local hour in HA timezone ──
    const currentLocalHour = () => utcToLocalHour(new Date().toISOString());

    // ── Helper: check if the requested date is today in HA timezone ──
    const isToday = (() => {
      try {
        const fmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: haTimeZone,
          year: 'numeric', month: '2-digit', day: '2-digit',
        });
        const todayStr  = fmt.format(now);
        const reqDate   = new Date(now);
        reqDate.setDate(reqDate.getDate() + this._offset);
        const reqStr    = fmt.format(reqDate);
        return todayStr === reqStr;
      } catch(e) { return this._offset === 0; }
    })();

    // ── Build labels and slot data for day view ────────────────────────────
    if (r === 'day') {
      // 25 slots: 00h–24h. Each hourly bucket placed at its local hour.
      // For today: past hours = stats deltas, current hour = live state value,
      // future hours = null (Chart.js renders null as a gap — no dot, no line).
      const solarSlots    = new Array(25).fill(isToday ? null : 0);
      const consSlots     = new Array(25).fill(isToday ? null : 0);
      const expSlots      = new Array(25).fill(isToday ? null : 0);
      const selfConsSlots = new Array(24).fill(0);
      const gridConsSlots = new Array(24).fill(0);

      // Always set 24h anchor to 0
      solarSlots[24] = 0;
      consSlots[24]  = 0;
      expSlots[24]   = 0;

      // Fill past hours from stats
      rawPts.forEach((pt, i) => {
        const h = utcToLocalHour(pt.start);
        if (h >= 0 && h <= 23) {
          solarSlots[h] = solar[i]    !== undefined ? +parseFloat(solar[i]).toFixed(2) : 0;
          consSlots[h]  = cons[i]     !== undefined ? +parseFloat(cons[i]).toFixed(2)  : 0;
          expSlots[h]   = exp[i]      !== undefined ? +parseFloat(exp[i]).toFixed(2)   : 0;
          selfConsSlots[h] = selfCons[i] !== undefined ? Math.max(0, parseFloat(selfCons[i])||0) : 0;
          gridConsSlots[h] = gridCons[i] !== undefined ? Math.max(0, parseFloat(gridCons[i])||0) : 0;
        }
      });

      // For today's current hour — overlay live entity state value
      if (isToday) {
        const nowHour = currentLocalHour();
        const liveGet = (id) => {
          if (!id || !this.hass) return null;
          const e = this.hass.states[id];
          return e ? Math.min(MAX_KWH_PER_HOUR, Math.max(0, parseFloat(e.state) || 0)) : null;
        };
        // Current hour: use live state of the today-sensor directly
        // (it shows accumulated kWh since midnight up to now for the current hour)
        // We show the state value itself as the current hour's bar
        const liveSolar = liveGet(cfg.production_today_entity);
        const liveCons  = liveGet(cfg.consumption_today_entity);
        const liveExp   = liveGet(cfg.export_today_entity);

        // Current hour slot gets the live accumulated value for this hour
        // = today's total minus sum of all completed hours
        const completedSolar = solarSlots.slice(0, nowHour).reduce((a,b) => a+(b||0), 0);
        const completedCons  = consSlots.slice(0, nowHour).reduce((a,b)  => a+(b||0), 0);
        const completedExp   = expSlots.slice(0, nowHour).reduce((a,b)   => a+(b||0), 0);

        if (liveSolar !== null) solarSlots[nowHour] = +Math.min(MAX_KWH_PER_HOUR, Math.max(0, liveSolar - completedSolar)).toFixed(2);
        if (liveCons  !== null) consSlots[nowHour]  = +Math.min(MAX_KWH_PER_HOUR, Math.max(0, liveCons  - completedCons)).toFixed(2);
        if (liveExp   !== null) expSlots[nowHour]   = +Math.min(MAX_KWH_PER_HOUR, Math.max(0, liveExp   - completedExp)).toFixed(2);

        // Hours after current remain null (no rendering)
      }

      const labels = Array.from({length:25}, (_,i) => String(i).padStart(2,'0')+'h');
      return {
        labels, r, isToday,
        solar: solarSlots, cons: consSlots, exp: expSlots,
        chartType: 'line', yUnit: 'kWh',
        ...this._donutDataFromArrays(
          solarSlots.slice(0,24).map(v=>v||0),
          selfConsSlots,
          consSlots.slice(0,24).map(v=>v||0),
          gridConsSlots,
          'kWh'
        ),
      };
    }

    if (r === 'month') {
      const days = new Date(end.getFullYear(), end.getMonth()+1, 0).getDate();
      const labels = Array.from({length:days}, (_,i) => String(i+1).padStart(2,'0'));
      const pad = (arr) => {
        const a = [...arr];
        while (a.length < days) a.push(0);
        return a.slice(0, days).map(v => +parseFloat(v).toFixed(2));
      };
      return {
        labels, r,
        solar: pad(solar), cons: pad(cons), exp: pad(exp),
        chartType: 'bar', yUnit: 'kWh',
        ...this._donutDataFromArrays(solar, selfCons, cons, gridCons, 'kWh'),
      };
    }

    // year
    const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const pad12 = (arr) => {
      const a = [...arr];
      while (a.length < 12) a.push(0);
      return a.slice(0, 12).map(v => +parseFloat(v).toFixed(2));
    };
    return {
      labels, r,
      solar: pad12(solar), cons: pad12(cons), exp: pad12(exp),
      chartType: 'bar', yUnit: 'kWh',
      ...this._donutDataFromArrays(solar, selfCons, cons, gridCons, 'kWh'),
    };
  }

  _donutDataFromArrays(solar, selfCons, cons, gridCons, unit) {
    const sum = arr => arr.reduce((a,b) => a+(+b||0), 0);
    const prodTotal = +sum(solar).toFixed(2);
    const prodCons  = +sum(selfCons).toFixed(2);
    const prodGrid  = +(Math.max(0, prodTotal - prodCons)).toFixed(2);
    const consTotal = +sum(cons).toFixed(2);
    const consPV    = prodCons;
    const consGrid  = +sum(gridCons).toFixed(2);
    const prodConsPct = prodTotal > 0 ? +((prodCons/prodTotal)*100).toFixed(2) : 0;
    const prodGridPct = prodTotal > 0 ? +((prodGrid/prodTotal)*100).toFixed(2) : 0;
    const consGridPct = consTotal > 0 ? +((consGrid/consTotal)*100).toFixed(2) : 0;
    const consPVPct   = consTotal > 0 ? +((consPV/consTotal)*100).toFixed(2) : 0;
    return { prodTotal, prodCons, prodGrid, prodConsPct, prodGridPct, consTotal, consPV, consGrid, consPVPct, consGridPct, unit };
  }

  _buildLifetimeData(sn, cfg, vals) {
    const { prodTotal, prodCons, prodGrid, consTotal, consPV, consGrid } = vals;
    const prodConsPct = prodTotal > 0 ? +((prodCons/prodTotal)*100).toFixed(2) : 0;
    const prodGridPct = prodTotal > 0 ? +((prodGrid/prodTotal)*100).toFixed(2) : 0;
    const consGridPct = consTotal > 0 ? +((consGrid/consTotal)*100).toFixed(2) : 0;
    const consPVPct   = consTotal > 0 ? +((consPV/consTotal)*100).toFixed(2) : 0;
    // Lifetime chart: year by year — best effort from available entities
    return {
      labels: ['Total'], r: 'lifetime',
      solar: [prodTotal], cons: [consTotal], exp: [prodGrid],
      chartType: 'bar', yUnit: 'kWh',
      prodTotal: +(prodTotal/1000).toFixed(2), prodCons: +(prodCons/1000).toFixed(2),
      prodGrid: +(prodGrid/1000).toFixed(2), prodConsPct, prodGridPct,
      consTotal: +(consTotal/1000).toFixed(2), consPV: +(consPV/1000).toFixed(2),
      consGrid: +(consGrid/1000).toFixed(2), consPVPct, consGridPct, unit: 'MWh',
    };
  }

  // ── Fallback: entity states when recorder unavailable ────────────────────
  _fallbackData(cfg, r) {
    const sn = (id) => { if (!id||!this.hass) return 0; const e=this.hass.states[id]; return e?parseFloat(e.state)||0:0; };
    const prodTotal = sn(r==='day'?cfg.production_today_entity:r==='month'?cfg.production_month_entity:cfg.panel_production_year_entity);
    const consTotal = sn(r==='day'?cfg.consumption_today_entity:r==='month'?cfg.consumption_month_entity:cfg.house_load_year_entity);
    const expTotal  = sn(r==='day'?cfg.export_today_entity:r==='month'?cfg.export_month_entity:cfg.grid_injection_year_entity);
    const prodCons  = sn(r==='day'?cfg.panel_production_consumption_today_entity:r==='month'?cfg.panel_production_consumption_month_entity:cfg.panel_production_consumption_year_entity);
    const gridCons  = sn(r==='day'?cfg.grid_consumption_today_entity:r==='month'?cfg.grid_consumption_month_entity:cfg.grid_consumption_year_entity);
    const labels = r==='day'?['Live','Today']:r==='month'?['This month']:['This year'];
    const mkArr = v => r==='day'?[sn(cfg.solar_power_entity),v]:[v];
    return {
      labels, r,
      solar: mkArr(prodTotal), cons: mkArr(consTotal), exp: mkArr(expTotal),
      chartType: r==='day'?'line':'bar', yUnit: r==='day'?'kW':'kWh',
      ...this._donutDataFromArrays([prodTotal],[prodCons],[consTotal],[gridCons],'kWh'),
    };
  }

  // ── Patch today's current hour with live entity state — no full refetch ──
  _patchTodayLiveHour() {
    if (!this._chart || !this._statsData || !this.hass) return;
    const cfg = this._config;
    const haTimeZone = (this.hass.config && this.hass.config.time_zone) || 'UTC';
    const MAX = 6.5;

    const utcToLocalHour = (isoStr) => {
      try {
        const fmt = new Intl.DateTimeFormat('en-US', { timeZone: haTimeZone, hour: 'numeric', hour12: false });
        const parts = fmt.formatToParts(new Date(isoStr));
        const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
        return h === 24 ? 0 : h;
      } catch(e) { return new Date(isoStr).getHours(); }
    };

    const nowHour = utcToLocalHour(new Date().toISOString());
    const liveGet = (id) => {
      if (!id) return 0;
      const e = this.hass.states[id];
      return e ? Math.min(MAX, Math.max(0, parseFloat(e.state) || 0)) : 0;
    };

    const liveSolar = liveGet(cfg.production_today_entity);
    const liveCons  = liveGet(cfg.consumption_today_entity);
    const liveExp   = liveGet(cfg.export_today_entity);

    const d = this._statsData;
    const completedSolar = d.solar.slice(0, nowHour).reduce((a,b) => a+(b||0), 0);
    const completedCons  = d.cons.slice(0, nowHour).reduce((a,b)  => a+(b||0), 0);
    const completedExp   = d.exp.slice(0, nowHour).reduce((a,b)   => a+(b||0), 0);

    this._chart.data.datasets[0].data[nowHour] = +Math.min(MAX, Math.max(0, liveSolar - completedSolar)).toFixed(2);
    this._chart.data.datasets[1].data[nowHour] = +Math.min(MAX, Math.max(0, liveCons  - completedCons)).toFixed(2);
    this._chart.data.datasets[2].data[nowHour] = +Math.min(MAX, Math.max(0, liveExp   - completedExp)).toFixed(2);
    this._chart.update('none');
  }

  // ── Chart build ───────────────────────────────────────────────────────────
  _buildChart() {
    const canvas = this.shadowRoot && this.shadowRoot.getElementById('fs-chart');
    if (!canvas || typeof Chart === 'undefined' || !this._statsData) return;
    const d = this._statsData;
    if (this._chart) this._chart.destroy();
    const isLine = d.chartType === 'line';
    this._chart = new Chart(canvas, {
      type: d.chartType,
      data: {
        labels: d.labels,
        datasets: [
          { label:'PV production', data:d.solar,
            borderColor:'#00e676', backgroundColor:isLine?'rgba(0,230,118,0.08)':'rgba(0,230,118,0.75)',
            fill:isLine, tension:isLine?0.4:0, pointRadius:isLine?2:0, pointBackgroundColor:'#00e676',
            borderWidth:isLine?2:0, borderRadius:isLine?0:3,
            spanGaps: false },
          { label:'Consumption', data:d.cons,
            borderColor:'#ff2d8f', backgroundColor:isLine?'transparent':'rgba(255,45,143,0.75)',
            fill:false, tension:isLine?0.4:0, pointRadius:isLine?2:0, pointBackgroundColor:'#ff2d8f',
            borderWidth:isLine?2:0, borderDash:isLine?[5,3]:undefined, borderRadius:isLine?0:3,
            spanGaps: false },
          { label:'Grid export', data:d.exp,
            borderColor:'#00e5ff', backgroundColor:isLine?'rgba(0,229,255,0.07)':'rgba(0,229,255,0.75)',
            fill:isLine, tension:isLine?0.4:0, pointRadius:isLine?2:0, pointBackgroundColor:'#00e5ff',
            borderWidth:isLine?2:0, borderRadius:isLine?0:3,
            spanGaps: false },
        ],
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{ mode:'index', intersect:false },
        plugins:{
          legend:{ display:false },
          tooltip:{
            backgroundColor:'rgba(8,15,35,0.92)', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
            titleColor:'#8b949e', bodyColor:'#e6edf3',
            titleFont:{ family:'DM Mono,monospace', size:10 },
            bodyFont:{ family:'DM Mono,monospace', size:11 }, padding:10,
            callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} ${d.yUnit}` },
          },
        },
        scales:{
          x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{font:{size:9},color:'#5a7090',maxRotation:0, maxTicksLimit: this._statsData && this._statsData.r === 'day' ? 25 : 12} },
          y:{ grid:{color:'rgba(255,255,255,0.05)'},
              min: 0,
              max: d.r === 'day' ? 6 : undefined,
              ticks:{font:{size:9},color:'#5a7090',
                stepSize: d.r === 'day' ? 1 : undefined,
                callback:v=>v+d.yUnit} },
        },
      },
    });
  }

  // ── Donut arc calculation ─────────────────────────────────────────────────
  // Returns SVG stroke-dasharray and stroke-dashoffset for two arcs
  _donutArcs(pct1) {
    const CIRC = 219.9, GAP = 3;
    const pct2 = 100 - pct1;
    const a1 = Math.max(0, pct1/100*CIRC - GAP);
    const a2 = Math.max(0, pct2/100*CIRC - GAP);
    return {
      arc1da: `${a1} ${CIRC-a1}`, arc1do: '0',
      arc2da: `${a2} ${CIRC-a2}`, arc2do: `${-(a1+GAP)}`,
    };
  }

  // ── Range/offset controls ─────────────────────────────────────────────────
  _setRange(r) { this._range = r; this._offset = 0; }
  _navPrev()   { if (this._range !== 'lifetime') this._offset = this._offset - 1; }
  _navNext()   { if (this._range !== 'lifetime' && this._offset < 0) this._offset = this._offset + 1; }

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
          <!-- Flow: Sun→PV Panels→Inverter→House  |  Grid→House -->
          <div class="fs-flow">
            <svg viewBox="0 0 520 440" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <marker id="a-sol"  markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b"/></marker>
                <marker id="a-pv"   markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#22c55e"/></marker>
                <marker id="a-inv"  markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#00f5ff"/></marker>
                <marker id="a-grid" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#f97316"/></marker>
              </defs>

              <!-- ── Flow paths ── -->
              <!-- 1. Sun → PV Panels -->
              <path class="fp ${solar > 0 ? '' : 'fp-idle'}" d="M228,112 Q166,162 134,234" stroke="#f59e0b" stroke-width="2" fill="none" marker-end="url(#a-sol)" opacity="0.85"/>
              <!-- 2. PV Panels → Inverter (DC) -->
              <path class="fp ${solar > 0 ? '' : 'fp-idle'}" d="M140,286 Q196,316 230,334" stroke="#22c55e" stroke-width="2" fill="none" marker-end="url(#a-pv)" opacity="0.85"/>
              <!-- 3. Inverter → House (AC, short stub) -->
              <line class="fp ${solar > 0 ? '' : 'fp-idle'}" x1="260" y1="314" x2="260" y2="302" stroke="#00f5ff" stroke-width="2.2" fill="none" marker-end="url(#a-inv)" opacity="0.9"/>
              <!-- 4. Grid → House -->
              <path class="fp fp-slow ${grid > 0.05 ? '' : 'fp-idle'}" d="M388,265 Q338,265 302,265" stroke="#f97316" stroke-width="1.8" fill="none" marker-end="url(#a-grid)" opacity="0.8"/>

              <!-- Flow value labels -->
              <text x="174" y="170" font-size="9" fill="#f59e0b" opacity="${solar > 0 ? '0.7' : '0.15'}" font-family="DM Mono,monospace" text-anchor="middle">${solar.toFixed(2)} kW</text>
              <text x="183" y="328" font-size="9" fill="#22c55e" opacity="${solar > 0 ? '0.7' : '0.15'}" font-family="DM Mono,monospace" text-anchor="middle">${solar.toFixed(2)} kW</text>
              <text x="344" y="256" font-size="9" fill="#f97316" opacity="${grid > 0.05 ? '0.7' : '0.15'}" font-family="DM Mono,monospace" text-anchor="middle">${grid.toFixed(2)} kW</text>

              <!-- ══ NODE: SUN (top center, 260,74) ══ -->
              <g transform="translate(260,74)" style="${solar > 0 ? 'filter:drop-shadow(0 0 8px #f59e0b)' : 'opacity:0.7'}">
                <circle r="37" fill="rgba(245,158,11,0.12)"/>
                <!-- Sun disc -->
                <circle r="14" fill="#f59e0b" opacity="0.85"/>
                <!-- Rays -->
                <g stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" opacity="0.9">
                  <line x1="0"   y1="-21" x2="0"   y2="-29"/>
                  <line x1="0"   y1="21"  x2="0"   y2="29"/>
                  <line x1="-21" y1="0"   x2="-29" y2="0"/>
                  <line x1="21"  y1="0"   x2="29"  y2="0"/>
                  <line x1="-15" y1="-15" x2="-21" y2="-21"/>
                  <line x1="15"  y1="-15" x2="21"  y2="-21"/>
                  <line x1="-15" y1="15"  x2="-21" y2="21"/>
                  <line x1="15"  y1="15"  x2="21"  y2="21"/>
                </g>
                <text y="52" text-anchor="middle" font-size="9" fill="#f59e0b" opacity="0.65" font-family="DM Sans,sans-serif" font-weight="600" letter-spacing="0.1em">SUN</text>
              </g>

              <!-- ══ NODE: PV PANELS (mid-left, 96,268) ══ -->
              <g transform="translate(96,268)" class="${solar > 0 ? 'fs-pulse-pv' : ''}" style="${solar <= 0 ? 'opacity:0.5' : ''}">
                <circle r="39" fill="rgba(34,197,94,0.10)"/>
                <!-- Panel cells 2×3 -->
                <g fill="rgba(34,197,94,0.20)" stroke="#22c55e" stroke-width="0.9">
                  <rect x="-22" y="-15" width="13" height="9" rx="1.5"/>
                  <rect x="-6"  y="-15" width="13" height="9" rx="1.5"/>
                  <rect x="10"  y="-15" width="13" height="9" rx="1.5"/>
                  <rect x="-22" y="-3"  width="13" height="9" rx="1.5"/>
                  <rect x="-6"  y="-3"  width="13" height="9" rx="1.5"/>
                  <rect x="10"  y="-3"  width="13" height="9" rx="1.5"/>
                </g>
                <!-- Glare lines -->
                <g stroke="#22c55e" stroke-width="0.7" opacity="0.45">
                  <line x1="-20" y1="-14" x2="-16" y2="-10"/>
                  <line x1="-4"  y1="-14" x2="0"   y2="-10"/>
                  <line x1="12"  y1="-14" x2="16"  y2="-10"/>
                </g>
                <!-- Mount legs -->
                <line x1="-10" y1="6" x2="-14" y2="17" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/>
                <line x1="10"  y1="6" x2="14"  y2="17" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/>
                <line x1="-16" y1="17" x2="16" y2="17" stroke="#22c55e" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>
                <text y="54" text-anchor="middle" font-size="9" fill="#22c55e" opacity="0.65" font-family="DM Sans,sans-serif" font-weight="600" letter-spacing="0.08em">PV PANELS</text>
              </g>

              <!-- ══ NODE: HOUSE (center, 260,258) — STATIC, no glow ══ -->
              <g transform="translate(260,258)">
                <circle r="40" fill="rgba(255,45,143,0.10)"/>
                <!-- Roof -->
                <polygon points="0,-22 -20,-2 20,-2" fill="#ff2d8f" opacity="0.55"/>
                <!-- Chimney -->
                <rect x="9" y="-26" width="6" height="9" rx="1" fill="#ff2d8f" opacity="0.45"/>
                <!-- Walls -->
                <rect x="-16" y="-2" width="32" height="22" rx="2" fill="#ff2d8f" opacity="0.25"/>
                <!-- Door -->
                <rect x="-5" y="9" width="10" height="11" rx="1.5" fill="#ff2d8f" opacity="0.6"/>
                <!-- Left window -->
                <rect x="-14" y="1" width="8" height="7" rx="1.5" fill="#ff2d8f" opacity="0.5"/>
                <line x1="-10" y1="1"   x2="-10" y2="8"    stroke="#ff2d8f" stroke-width="0.8" opacity="0.6"/>
                <line x1="-14" y1="4.5" x2="-6"  y2="4.5"  stroke="#ff2d8f" stroke-width="0.8" opacity="0.6"/>
                <!-- Right window -->
                <rect x="6"   y="1" width="8" height="7" rx="1.5" fill="#ff2d8f" opacity="0.5"/>
                <line x1="10"  y1="1"   x2="10"  y2="8"    stroke="#ff2d8f" stroke-width="0.8" opacity="0.6"/>
                <line x1="6"   y1="4.5" x2="14"  y2="4.5"  stroke="#ff2d8f" stroke-width="0.8" opacity="0.6"/>
                <!-- kW value above node -->
                <text y="-30" text-anchor="middle" font-size="13" fill="#ff2d8f" font-family="DM Mono,monospace" font-weight="500">${house.toFixed(2)}</text>
                <text y="-20" text-anchor="middle" font-size="7"  fill="#ff2d8f" opacity="0.6" font-family="DM Mono,monospace">kW</text>
                <text y="55"  text-anchor="middle" font-size="9"  fill="#ff2d8f" opacity="0.65" font-family="DM Sans,sans-serif" font-weight="600" letter-spacing="0.08em">HOUSE</text>
              </g>

              <!-- ══ NODE: INVERTER (small, below house, 260,350) ══ -->
              <g transform="translate(260,350)" class="${solar > 0 ? 'fs-pulse-inv' : ''}" style="${solar <= 0 ? 'opacity:0.5' : ''}">
                <circle r="24" fill="rgba(0,245,255,0.10)"/>
                <!-- Box with sine wave -->
                <rect x="-13" y="-10" width="26" height="18" rx="3" fill="rgba(0,245,255,0.14)" stroke="#00f5ff" stroke-width="0.9"/>
                <path d="M-9,-1 Q-6,-7 -3,-1 Q0,5 3,-1 Q6,-7 9,-1" stroke="#00f5ff" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.95"/>
                <text x="-12" y="-5" font-size="4.5" fill="#00f5ff" opacity="0.5" font-family="DM Mono,monospace">DC</text>
                <text x="7"   y="7"  font-size="4.5" fill="#00f5ff" opacity="0.5" font-family="DM Mono,monospace">AC</text>
                <text y="38" text-anchor="middle" font-size="8" fill="#00f5ff" opacity="0.6" font-family="DM Sans,sans-serif" font-weight="600" letter-spacing="0.08em">INVERTER</text>
              </g>

              <!-- ══ NODE: GRID (mid-right, 424,268) ══ -->
              <g transform="translate(424,268)" class="${grid > 0.05 ? 'fs-pulse-grid' : ''}" style="${grid <= 0.05 ? 'opacity:0.5' : ''}">
                <circle r="37" fill="rgba(249,115,22,0.10)"/>
                <!-- Pylon -->
                <line x1="0"   y1="-22" x2="0"   y2="18"  stroke="#f97316" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
                <line x1="-17" y1="-8"  x2="17"  y2="-8"  stroke="#f97316" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
                <line x1="-11" y1="5"   x2="11"  y2="5"   stroke="#f97316" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
                <line x1="-17" y1="-8"  x2="-8"  y2="5"   stroke="#f97316" stroke-width="0.9" opacity="0.5"/>
                <line x1="17"  y1="-8"  x2="8"   y2="5"   stroke="#f97316" stroke-width="0.9" opacity="0.5"/>
                <line x1="0"   y1="18"  x2="-13" y2="26"  stroke="#f97316" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
                <line x1="0"   y1="18"  x2="13"  y2="26"  stroke="#f97316" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
                <circle cx="-17" cy="-8"  r="2.2" fill="#f97316" opacity="0.85"/>
                <circle cx="17"  cy="-8"  r="2.2" fill="#f97316" opacity="0.85"/>
                <circle cx="-11" cy="5"   r="1.8" fill="#f97316" opacity="0.75"/>
                <circle cx="11"  cy="5"   r="1.8" fill="#f97316" opacity="0.75"/>
                <circle cx="0"   cy="-22" r="2.8" fill="#f97316" opacity="0.9"/>
                <text y="52" text-anchor="middle" font-size="9" fill="#f97316" opacity="0.65" font-family="DM Sans,sans-serif" font-weight="600" letter-spacing="0.1em">GRID</text>
              </g>
            </svg>
          </div>

          <!-- ── Arc gauge strip ── -->
          <div class="fs-gauges">
            <div class="fs-gauge solar">
              <div class="gau-lbl">Solar</div>
              <svg class="gau-arc" width="54" height="30" viewBox="0 0 54 30">
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="#00e676" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="${this._arcOffset(solar, 6)}"/>
              </svg>
              <div class="gau-val" style="color:#00e676">${solar.toFixed(2)}<span class="gau-unit">kW</span></div>
            </div>

            <div class="fs-gauge home">
              <div class="gau-lbl">House</div>
              <svg class="gau-arc" width="54" height="30" viewBox="0 0 54 30">
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="#ff2d8f" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="${this._arcOffset(house, 5)}"/>
              </svg>
              <div class="gau-val" style="color:#ff2d8f">${house.toFixed(2)}<span class="gau-unit">kW</span></div>
            </div>

            <div class="fs-gauge grid">
              <div class="gau-lbl">Grid</div>
              <svg class="gau-arc" width="54" height="30" viewBox="0 0 54 30">
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none" stroke-linecap="round"/>
                <path d="M4,28 A23,23 0 0,1 50,28" stroke="#ff1744" stroke-width="4" fill="none" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="${this._arcOffset(grid, 4)}"/>
              </svg>
              <div class="gau-val" style="color:#ff1744">${grid.toFixed(2)}<span class="gau-unit">kW</span></div>
            </div>

            ${batSoc !== null ? html`
              <div class="fs-gauge bat">
                <div class="gau-lbl">Battery</div>
                <div class="gau-bat-val" style="color:#8b5cf6">${batSoc.toFixed(0)}<span class="gau-unit">%</span></div>
                <div class="gau-bat-bar"><div class="gau-bat-fill" style="width:${batSoc}%"></div></div>
              </div>
            ` : ''}
          </div>

          <!-- ── Unified Tab Bar ── -->
          <div class="fs-tabbar">
            <button class="fs-rtab ${this._range==='day'      ?'active':''}" @click="${()=>this._setRange('day')}">Day</button>
            <button class="fs-rtab ${this._range==='month'    ?'active':''}" @click="${()=>this._setRange('month')}">Month</button>
            <button class="fs-rtab ${this._range==='year'     ?'active':''}" @click="${()=>this._setRange('year')}">Year</button>
            <button class="fs-rtab ${this._range==='lifetime' ?'active':''}" @click="${()=>this._setRange('lifetime')}">Lifetime</button>
          </div>

          <!-- ── Date navigation ── -->
          <div class="fs-datenav">
            <button class="fs-datenav-arrow" @click="${()=>this._navPrev()}" ?disabled="${this._range==='lifetime'}">‹</button>
            <span class="fs-datenav-label">${this._dateLabel()}</span>
            <button class="fs-datenav-arrow" @click="${()=>this._navNext()}" ?disabled="${this._range==='lifetime' || this._offset >= 0}">›</button>
          </div>

          <!-- ── Energy Panels: Production + Consumption donuts ── -->
          ${this._renderEnergyPanels()}

          <!-- ── Chart ── -->
          <div class="fs-chart-wrap">
            <div class="fs-chart-header">
              <span class="fs-chart-label">Energy History</span>
              ${this._statsLoading ? html`<span class="fs-loading-dot"></span>` : ''}
            </div>
            <div class="fs-chart-area">
              <div class="fs-legend">
                <span class="fs-leg-item"><span class="fs-leg-dot" style="background:#00e676"></span>PV production</span>
                <span class="fs-leg-item"><span class="fs-leg-dot" style="background:#ff2d8f"></span>Consumption</span>
                <span class="fs-leg-item"><span class="fs-leg-dot" style="background:#00e5ff"></span>Grid export</span>
              </div>
              <div class="fs-chart-canvas-wrap">
                <canvas id="fs-chart" role="img" aria-label="Energy history chart"></canvas>
              </div>
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

  // ── Energy Panels renderer ───────────────────────────────────────────────
  _renderEnergyPanels() {
    const d = this._statsData;
    if (!d) {
      return this._statsLoading
        ? html`<div class="fs-panels-loading">Loading statistics…</div>`
        : html`<div class="fs-panels-loading">Configure production &amp; consumption entities to see energy breakdown</div>`;
    }

    const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : (v || '—');
    const pa = this._donutArcs(d.prodConsPct);
    const ca = this._donutArcs(d.consPVPct);

    return html`
      <div class="fs-panels">

        <!-- Production panel -->
        <div class="fs-panel">
          <div class="fs-panel-title">
            <span class="fs-panel-dot" style="background:#00e676;box-shadow:0 0 6px #00e676;"></span>
            Production
          </div>
          <div class="fs-panel-inner">
            <div class="fs-donut-wrap">
              <svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(-90deg);width:100%;height:100%;">
                <circle cx="45" cy="45" r="35" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
                <circle cx="45" cy="45" r="35" fill="none" stroke="#1a6640" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="${pa.arc1da}" stroke-dashoffset="${pa.arc1do}"/>
                <circle cx="45" cy="45" r="35" fill="none" stroke="#00e676" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="${pa.arc2da}" stroke-dashoffset="${pa.arc2do}"/>
              </svg>
              <div class="fs-donut-center">
                <div class="fs-donut-val" style="color:#00e676">${fmt(d.prodTotal)}</div>
                <div class="fs-donut-unit">${d.unit}</div>
              </div>
            </div>
            <div class="fs-panel-stats">
              <div class="fs-pstat">
                <div class="fs-pstat-val" style="color:#1a6640">${fmt(d.prodCons)}<span class="fs-pstat-u">${d.unit}</span></div>
                <div class="fs-pstat-lbl">Consumed (${d.prodConsPct}%)</div>
              </div>
              <div class="fs-pstat">
                <div class="fs-pstat-val" style="color:#00e676">${fmt(d.prodGrid)}<span class="fs-pstat-u">${d.unit}</span></div>
                <div class="fs-pstat-lbl">Fed to grid (${d.prodGridPct}%)</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Consumption panel -->
        <div class="fs-panel">
          <div class="fs-panel-title">
            <span class="fs-panel-dot" style="background:#ff2d8f;box-shadow:0 0 6px #ff2d8f;"></span>
            Consumption
          </div>
          <div class="fs-panel-inner">
            <div class="fs-donut-wrap">
              <svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(-90deg);width:100%;height:100%;">
                <circle cx="45" cy="45" r="35" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
                <circle cx="45" cy="45" r="35" fill="none" stroke="#ff5722" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="${ca.arc1da}" stroke-dashoffset="${ca.arc1do}"/>
                <circle cx="45" cy="45" r="35" fill="none" stroke="#f59e0b" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="${ca.arc2da}" stroke-dashoffset="${ca.arc2do}"/>
              </svg>
              <div class="fs-donut-center">
                <div class="fs-donut-val" style="color:#ff2d8f">${fmt(d.consTotal)}</div>
                <div class="fs-donut-unit">${d.unit}</div>
              </div>
            </div>
            <div class="fs-panel-stats">
              <div class="fs-pstat">
                <div class="fs-pstat-val" style="color:#ff5722">${fmt(d.consPV)}<span class="fs-pstat-u">${d.unit}</span></div>
                <div class="fs-pstat-lbl">From PV (${d.consPVPct}%)</div>
              </div>
              <div class="fs-pstat">
                <div class="fs-pstat-val" style="color:#f59e0b">${fmt(d.consGrid)}<span class="fs-pstat-u">${d.unit}</span></div>
                <div class="fs-pstat-lbl">From grid (${d.consGridPct}%)</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

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
        ${this._subLbl('PV Strings', '#22c55e')}
        <div class="det-grid">
          ${this._numTile('PV1 Power',   cfg.pv1_power_entity,   '#22c55e', 'kW',  '⚡')}
          ${this._numTile('PV2 Power',   cfg.pv2_power_entity,   '#22c55e', 'kW',  '⚡')}
          ${this._numTile('PV1 Voltage', cfg.pv1_voltage_entity, '#22c55e', 'V',   '〰')}
          ${this._numTile('PV2 Voltage', cfg.pv2_voltage_entity, '#22c55e', 'V',   '〰')}
          ${this._numTile('PV1 Current', cfg.pv1_current_entity, '#22c55e', 'A',   '〜')}
          ${this._numTile('PV2 Current', cfg.pv2_current_entity, '#22c55e', 'A',   '〜')}
        </div>
      ` : ''}
      ${hasGrd ? html`
        ${this._subLbl('Grid Connection', '#f97316')}
        <div class="det-grid">
          ${this._numTile('Phase A Voltage',       cfg.phase_a_voltage_entity,      '#f97316','V',   '⚡')}
          ${this._numTile('Phase B Voltage',       cfg.phase_b_voltage_entity,      '#f97316','V',   '⚡')}
          ${this._numTile('Phase C Voltage',       cfg.phase_c_voltage_entity,      '#f97316','V',   '⚡')}
          ${this._numTile('Grid Current',          cfg.grid_current_entity,         '#f97316','A',   '〜')}
          ${this._numTile('Phase B Current',       cfg.phase_b_current_entity,      '#f97316','A',   '〜')}
          ${this._numTile('Phase C Current',       cfg.phase_c_current_entity,      '#f97316','A',   '〜')}
          ${this._numTile('Grid Frequency',        cfg.grid_frequency_entity,       '#f97316','Hz',  '∿')}
          ${this._numTile('Power Factor',          cfg.power_factor_entity,         '#f97316','',    'φ')}
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
        ${this._subLbl('Grid Consumption', '#f97316')}
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
    return this._detSection('grid', '#f97316', 'Grid & House Load', content);
  }

  _renderPanelsSection() {
    const cfg = this._config;
    const hasFore = hasCfg(cfg,'panel_production_power_entity','pv_forecasted_today_entity','pv_remaining_today_entity');
    const hasProd = hasCfg(cfg,'panel_production_today_entity','panel_production_week_entity','panel_production_month_entity','panel_production_year_entity','panel_production_lifetime_entity');
    const hasCons = hasCfg(cfg,'panel_production_consumption_today_entity','panel_production_consumption_week_entity','panel_production_consumption_month_entity','panel_production_consumption_year_entity','panel_production_consumption_lifetime_entity');
    if (!hasFore && !hasProd && !hasCons) return html``;

    const content = html`
      ${hasFore ? html`
        ${this._subLbl('Live & Forecast', '#22c55e')}
        <div class="det-grid">
          ${this._numTile('Production Power', cfg.panel_production_power_entity, '#22c55e', 'kW', '☀️')}
          ${cfg.pv_forecasted_today_entity ? html`
            <div class="det-tile" style="--tc:#22c55e">
              <span class="dt-icon">🔮</span>
              <div>
                <div class="dt-lbl">Forecasted Today</div>
                <div class="dt-val" style="color:#22c55e">${sf(this.hass, cfg.pv_forecasted_today_entity, 2)}<span class="dt-unit">kWh</span></div>
              </div>
            </div>` : ''}
          ${cfg.pv_remaining_today_entity ? html`
            <div class="det-tile" style="--tc:#22c55e">
              <span class="dt-icon">⏳</span>
              <div>
                <div class="dt-lbl">Remaining Today</div>
                <div class="dt-val" style="color:#22c55e">${sf(this.hass, cfg.pv_remaining_today_entity, 2)}<span class="dt-unit">kWh</span></div>
              </div>
            </div>` : ''}
        </div>
      ` : ''}
      ${hasProd ? html`
        ${this._subLbl('Production History', '#22c55e')}
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
    return this._detSection('panels', '#22c55e', 'Panel Production & Forecast', content);
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
      .fs-flow { position:relative; height:440px; }
      .fs-flow svg { width:100%; height:100%; overflow:visible; }
      .fp      { stroke-dasharray:8 5; animation:fsdash 1.4s linear infinite; }
      .fp-slow { stroke-dasharray:7 6; animation:fsdash 2.4s linear infinite; }
      .fp-idle { animation:none !important; opacity:0.07 !important; }
      @keyframes fsdash { to { stroke-dashoffset:-22; } }

      /* ── Node pulse glow — applied to <g> group, animates drop-shadow on icon content ── */
      /* No stroke circle on nodes = no visible ring. Glow is purely the icon content glowing. */
      @keyframes fsPulseSun  { 0%,100%{filter:drop-shadow(0 0 8px #f59e0b) drop-shadow(0 0 18px rgba(245,158,11,0.4));} 50%{filter:drop-shadow(0 0 2px #f59e0b);} }
      @keyframes fsPulsePV   { 0%,100%{filter:drop-shadow(0 0 8px #22c55e) drop-shadow(0 0 18px rgba(34,197,94,0.4));}  50%{filter:drop-shadow(0 0 2px #22c55e);} }
      @keyframes fsPulseInv  { 0%,100%{filter:drop-shadow(0 0 8px #00f5ff) drop-shadow(0 0 18px rgba(0,245,255,0.4));} 50%{filter:drop-shadow(0 0 2px #00f5ff);} }
      @keyframes fsPulseGrid { 0%,100%{filter:drop-shadow(0 0 8px #f97316) drop-shadow(0 0 18px rgba(249,115,22,0.4));} 50%{filter:drop-shadow(0 0 2px #f97316);} }

      .fs-pulse-sun  { animation:fsPulseSun  2s   ease-in-out infinite; }
      .fs-pulse-pv   { animation:fsPulsePV   2.4s ease-in-out infinite; }
      .fs-pulse-inv  { animation:fsPulseInv  1.9s ease-in-out infinite; }
      .fs-pulse-grid { animation:fsPulseGrid 2.7s ease-in-out infinite; }

      /* ── Arc gauges ── */
      .fs-gauges { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin-top:1rem; }
      .fs-gauge { background:rgba(3,8,20,0.52); backdrop-filter:blur(14px); border:1px solid rgba(0,245,255,0.07); border-radius:11px; padding:0.6rem 0.3rem 0.5rem; text-align:center; position:relative; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.25); }
      .fs-gauge::after { content:''; position:absolute; top:0; left:0; right:0; height:2px; border-radius:11px 11px 0 0; }
      .fs-gauge.solar::after { background:#00e676; box-shadow:0 0 7px #00e676; }
      .fs-gauge.home::after  { background:#ff2d8f; box-shadow:0 0 7px #ff2d8f; }
      .fs-gauge.grid::after  { background:#ff1744; box-shadow:0 0 7px #ff1744; }
      .fs-gauge.bat::after   { background:#8b5cf6; box-shadow:0 0 7px #8b5cf6; }
      .gau-lbl  { font-size:9px; color:#6a8aaa; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:4px; }
      .gau-arc  { display:block; margin:0 auto 3px; }
      .gau-val  { font-family:'DM Mono',monospace; font-size:14px; font-weight:500; line-height:1; }
      .gau-unit { font-size:9px; color:#6a8aaa; margin-left:1px; }
      .gau-bat-val { font-family:'DM Mono',monospace; font-size:17px; font-weight:500; height:30px; display:flex; align-items:center; justify-content:center; }
      .gau-bat-bar  { width:80%; margin:3px auto 0; height:3px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden; }
      .gau-bat-fill { height:100%; background:#8b5cf6; border-radius:2px; box-shadow:0 0 5px #8b5cf6; }

      /* ── Unified tab bar ── */
      .fs-tabbar { display:flex; gap:4px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:4px; margin-top:1rem; }
      .fs-rtab   { flex:1; padding:7px 4px; font-size:11px; font-weight:600; text-align:center; border-radius:8px; cursor:pointer; color:#6a8aaa; letter-spacing:0.06em; text-transform:uppercase; transition:all .15s; border:1px solid transparent; background:transparent; font-family:inherit; }
      .fs-rtab.active { background:rgba(0,230,118,0.14); color:#00e676; border-color:rgba(0,230,118,0.28); }
      .fs-rtab:hover:not(.active) { background:rgba(255,255,255,0.03); color:#ddeeff; }

      /* ── Date navigation ── */
      .fs-datenav { display:flex; align-items:center; justify-content:center; gap:18px; margin:0.8rem 0; }
      .fs-datenav-arrow { background:none; border:none; color:#6a8aaa; font-size:20px; cursor:pointer; padding:4px 10px; font-family:inherit; transition:color .15s; border-radius:6px; }
      .fs-datenav-arrow:hover:not([disabled]) { color:#ddeeff; background:rgba(255,255,255,0.04); }
      .fs-datenav-arrow[disabled] { opacity:0.2; cursor:default; }
      .fs-datenav-label { font-size:14px; font-weight:500; color:#ddeeff; min-width:120px; text-align:center; }

      /* ── Energy panels: 2-col desktop / 1-col mobile ── */
      .fs-panels { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
      .fs-panel  { background:rgba(3,8,20,0.55); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.07); border-radius:13px; padding:0.9rem; }
      .fs-panel-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.09em; color:#6a8aaa; margin-bottom:0.8rem; display:flex; align-items:center; gap:7px; }
      .fs-panel-dot   { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
      .fs-panel-inner { display:flex; align-items:center; gap:10px; }

      /* ── Donut ── */
      .fs-donut-wrap   { position:relative; width:88px; height:88px; flex-shrink:0; }
      .fs-donut-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
      .fs-donut-val  { font-family:'DM Mono',monospace; font-size:13px; font-weight:500; line-height:1.1; }
      .fs-donut-unit { font-size:8px; color:#6a8aaa; margin-top:2px; }

      /* ── Panel stat rows ── */
      .fs-panel-stats { display:flex; flex-direction:column; gap:6px; flex:1; min-width:0; }
      .fs-pstat       { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:7px; padding:5px 8px; }
      .fs-pstat-val   { font-family:'DM Mono',monospace; font-size:13px; font-weight:500; white-space:nowrap; }
      .fs-pstat-u     { font-size:8px; color:#6a8aaa; margin-left:2px; }
      .fs-pstat-lbl   { font-size:9px; color:#6a8aaa; margin-top:2px; }

      /* ── Loading ── */
      .fs-panels-loading { text-align:center; font-size:11px; color:#6a8aaa; padding:1rem; margin-bottom:8px; }
      .fs-loading-dot    { display:inline-block; width:6px; height:6px; border-radius:50%; background:#00e676; animation:fspulse 1s infinite; }

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
      --c-cs: #00e676; --c-cg: #ff1744; --c-ch: #ff2d8f; --c-cb: #8b5cf6; --c-cw: #f59e0b;

      .dt-lbl  { font-size:8px; color:#6a8aaa; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .dt-val  { font-family:'DM Mono',monospace; font-size:13px; font-weight:500; line-height:1; }
      .dt-unit { font-size:8px; color:#6a8aaa; margin-left:1px; }
      .dt-icon { font-size:13px; flex-shrink:0; }
      .dt-bar  { height:2px; border-radius:1px; background:rgba(255,255,255,0.07); margin-top:3px; overflow:hidden; }
      .dt-bar-fill { height:100%; border-radius:1px; transition:width 0.6s; }
      .dt-badge { display:inline-block; font-size:9px; font-weight:500; padding:2px 7px; border-radius:5px; background:rgba(0,245,255,0.1); border:1px solid rgba(0,245,255,0.18); color:#00f5ff; white-space:nowrap; }

      /* ── Responsive ── */
      @media (max-width: 480px) {
        .fs-gauges  { grid-template-columns: repeat(2,1fr); }
        .fs-flow    { height:380px; }
        .fs-panels  { grid-template-columns: 1fr; }
        .det-grid   { grid-template-columns: 1fr 1fr; }
        .fs-card    { padding:0.9rem; border-radius:16px; }
        .fs-rtab    { font-size:10px; padding:6px 2px; }
      }
      @media (max-width: 340px) {
        .fs-gauges  { grid-template-columns: repeat(2,1fr); }
        .fs-flow    { height:340px; }
        .det-grid   { grid-template-columns: 1fr; }
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

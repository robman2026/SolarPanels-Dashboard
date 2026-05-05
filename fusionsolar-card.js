/**
 * FusionSolar Card — Visual Editor
 * Follows the exact same LitElement + ha-entity-picker pattern as kitchen-card-editor
 * Drop this alongside fusionsolar-card.js and register via customElements.define()
 *
 * Usage in HA Lovelace:
 *   type: custom:fusionsolar-card
 */

// ── LitElement bootstrap (same as kitchen-card) ──────────────────────────────
const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const { html, css } = LitElement.prototype;

// ── Default / stub config ────────────────────────────────────────────────────
function getDefaultConfig() {
  return {
    // Header
    card_title: 'SUN2000 · FusionSolar',
    card_subtitle: 'Huawei inverter · Home Assistant',

    // Main flow entities (flow diagram + arc gauges)
    solar_power_entity:   '',   // sensor.panel_production_power
    house_power_entity:   '',   // sensor.house_load_power
    grid_power_entity:    '',   // sensor.grid_consumption_power
    battery_soc_entity:   '',   // sensor.battery_state_of_capacity (optional)

    // Chart – history (Day/Week/Month)
    production_today_entity:  '',
    production_week_entity:   '',
    production_month_entity:  '',
    consumption_today_entity: '',
    consumption_week_entity:  '',
    consumption_month_entity: '',
    export_today_entity:      '',
    export_week_entity:       '',
    export_month_entity:      '',

    // Self-consumption rate
    self_consumption_entity: '',

    // ── Inverter detail section ──
    show_inverter: true,
    pv1_power_entity:   '',
    pv1_voltage_entity: '',
    pv1_current_entity: '',
    pv2_power_entity:   '',
    pv2_voltage_entity: '',
    pv2_current_entity: '',
    phase_a_voltage_entity: '',
    phase_b_voltage_entity: '',
    phase_c_voltage_entity: '',
    grid_current_entity:    '',
    phase_b_current_entity: '',
    phase_c_current_entity: '',
    grid_frequency_entity:  '',
    power_factor_entity:    '',
    insulation_resistance_entity: '',
    internal_temperature_entity:  '',

    // ── Grid & House Load detail section ──
    show_grid: true,
    grid_consumption_today_entity:    '',
    grid_consumption_week_entity:     '',
    grid_consumption_month_entity:    '',
    grid_consumption_year_entity:     '',
    grid_consumption_lifetime_entity: '',
    grid_injection_today_entity:      '',
    grid_injection_week_entity:       '',
    grid_injection_month_entity:      '',
    grid_injection_year_entity:       '',
    grid_injection_lifetime_entity:   '',
    house_load_today_entity:          '',
    house_load_week_entity:           '',
    house_load_month_entity:          '',
    house_load_year_entity:           '',
    house_load_lifetime_entity:       '',

    // ── Panel Production & Forecast section ──
    show_panels: true,
    panel_production_power_entity:              '',
    pv_forecasted_today_entity:                 '',
    pv_remaining_today_entity:                  '',
    panel_production_today_entity:              '',
    panel_production_week_entity:               '',
    panel_production_month_entity:              '',
    panel_production_year_entity:               '',
    panel_production_lifetime_entity:           '',
    panel_production_consumption_today_entity:  '',
    panel_production_consumption_week_entity:   '',
    panel_production_consumption_month_entity:  '',
    panel_production_consumption_year_entity:   '',
    panel_production_consumption_lifetime_entity:'',

    // ── Self-Consumption Ratios section ──
    show_ratios: true,
    sc_ratio_load_today_entity:       '',
    sc_ratio_load_week_entity:        '',
    sc_ratio_load_month_entity:       '',
    sc_ratio_load_year_entity:        '',
    sc_ratio_load_lifetime_entity:    '',
    sc_ratio_prod_today_entity:       '',
    sc_ratio_prod_week_entity:        '',
    sc_ratio_prod_month_entity:       '',
    sc_ratio_prod_year_entity:        '',
    sc_ratio_prod_lifetime_entity:    '',

    // ── Diagnostics section ──
    show_diagnostics: true,
    inverter_status_entity:      '',
    inverter_output_mode_entity: '',
    inverter_last_updated_entity:'',
    inverter_start_time_entity:  '',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// VISUAL EDITOR
// ════════════════════════════════════════════════════════════════════════════
class FusionSolarCardEditor extends LitElement {
  static get properties() {
    return {
      hass:          {},
      _config:       { state: true },
      _openSections: { state: true },
      _pickersReady: { state: true },
    };
  }

  constructor() {
    super();
    this._openSections = { header: true, flow: true };
    this._pickersReady = false;
  }

  async firstUpdated() {
    const timeout = setTimeout(() => { this._pickersReady = true; this.requestUpdate(); }, 3000);
    try {
      if (!customElements.get('ha-entity-picker')) {
        const helpers = await window.loadCardHelpers();
        const c = await helpers.createCardElement({ type: 'entities', entities: [] });
        await c.constructor.getConfigElement();
      }
    } catch (_) {}
    this._pickersReady = true;
    clearTimeout(timeout);
    this.requestUpdate();
  }

  setConfig(config) {
    this._config = Object.assign({}, getDefaultConfig(), config || {});
  }

  _fire() {
    const ev = new Event('config-changed', { bubbles: true, composed: true });
    ev.detail = { config: this._config };
    this.dispatchEvent(ev);
  }

  _set(key, val) {
    this._config = Object.assign({}, this._config, { [key]: val });
    this._fire();
  }
  _toggleSec(id) {
    this._openSections = Object.assign({}, this._openSections, { [id]: !this._openSections[id] });
  }

  // ── Atomic editor widgets — identical API to kitchen-card-editor ──────────

  _txt(label, value, onChange, placeholder) {
    return html`<div class="ed-field">
      <label class="ed-label">${label}</label>
      <input class="ed-input" type="text" .value="${value || ''}" placeholder="${placeholder || ''}"
        @change="${(e) => onChange(e.target.value)}" />
    </div>`;
  }

  _toggle(label, checked, onChange) {
    return html`<div class="toggle-row">
      <span class="toggle-label">${label}</span>
      <label class="toggle-wrap">
        <input type="checkbox" .checked="${!!checked}" @change="${(e) => onChange(e.target.checked)}" />
        <span class="toggle-slider"></span>
      </label>
    </div>`;
  }

  _seg(label, value, options, onChange) {
    return html`<div class="ed-field">
      <label class="ed-label">${label}</label>
      <div class="segmented">
        ${options.map((o) => html`
          <div class="seg-opt ${value === o.val ? 'active' : ''}" @click="${() => onChange(o.val)}">${o.label}</div>
        `)}
      </div>
    </div>`;
  }

  /**
   * ha-entity-picker — searchable dropdown, same as kitchen-card-editor.
   * domains: array of allowed HA domains e.g. ['sensor','binary_sensor']
   * label: field label shown above the picker
   */
  _entityPicker(value, onChange, domains, label) {
    return html`<div class="ed-field">
      <label class="ed-label">${label || 'Entity'}</label>
      <ha-entity-picker
        .hass=${this.hass}
        .value=${value || ''}
        .includeDomains=${domains && domains.length ? domains : undefined}
        allow-custom-entity
        @value-changed=${(e) => {
          const v = e.detail.value || '';
          if (v !== (value || '')) onChange(v);
        }}
      ></ha-entity-picker>
    </div>`;
  }

  _iconPicker(value, onChange, ph) {
    return html`<div class="ed-field">
      <label class="ed-label">Icon</label>
      <ha-icon-picker
        .hass=${this.hass}
        .value=${value || ''}
        .placeholder=${ph || 'mdi:...'}
        @value-changed=${(e) => { const v = e.detail.value || ''; if (v !== (value || '')) onChange(v); }}
      ></ha-icon-picker>
    </div>`;
  }

  _section(id, title, count, content) {
    const open = !!this._openSections[id];
    return html`<div class="ed-section ${open ? 'open' : ''}">
      <div class="ed-section-header" @click="${() => this._toggleSec(id)}">
        <div class="ed-section-title">
          ${title}
          ${count !== undefined ? html`<span class="ed-section-count">${count}</span>` : ''}
        </div>
        <span class="ed-section-arrow">▾</span>
      </div>
      <div class="ed-section-body">${open ? content : ''}</div>
    </div>`;
  }

  _groupLabel(text, color) {
    return html`<p class="hint-group" style="color:${color || 'var(--primary-color,#e07c4f)'}">${text}</p>`;
  }

  // ── Section content renderers ─────────────────────────────────────────────

  _headerContent() {
    const cfg = this._config;
    return html`
      ${this._txt('Card Title',    cfg.card_title,    (v) => this._set('card_title', v),    'SUN2000 · FusionSolar')}
      ${this._txt('Card Subtitle', cfg.card_subtitle, (v) => this._set('card_subtitle', v), 'Huawei inverter · Home Assistant')}
    `;
  }

  _flowContent() {
    const cfg = this._config;
    return html`
      <p class="hint">These four entities power the animated flow diagram, arc gauges, and live node values at the top of the card.</p>

      ${this._entityPicker(cfg.solar_power_entity,  (v) => this._set('solar_power_entity', v),  ['sensor'], '☀️  Solar / PV Production Power (kW)')}
      ${this._entityPicker(cfg.house_power_entity,  (v) => this._set('house_power_entity', v),  ['sensor'], '🏠  House Load Power (kW)')}
      ${this._entityPicker(cfg.grid_power_entity,   (v) => this._set('grid_power_entity', v),   ['sensor'], '⚡  Grid Consumption Power (kW)')}
      ${this._entityPicker(cfg.battery_soc_entity,  (v) => this._set('battery_soc_entity', v),  ['sensor'], '🔋  Battery State of Charge % — optional')}
      ${this._entityPicker(cfg.self_consumption_entity,(v)=> this._set('self_consumption_entity',v),['sensor'],'%  Self-Consumption Rate — optional')}

      ${this._groupLabel('Chart — Day data')}
      ${this._entityPicker(cfg.production_today_entity,  (v) => this._set('production_today_entity', v),  ['sensor'], 'PV Production Today (kWh)')}
      ${this._entityPicker(cfg.consumption_today_entity, (v) => this._set('consumption_today_entity', v), ['sensor'], 'House Consumption Today (kWh)')}
      ${this._entityPicker(cfg.export_today_entity,      (v) => this._set('export_today_entity', v),      ['sensor'], 'Grid Export Today (kWh)')}

      ${this._groupLabel('Chart — Week data')}
      ${this._entityPicker(cfg.production_week_entity,  (v) => this._set('production_week_entity', v),  ['sensor'], 'PV Production This Week')}
      ${this._entityPicker(cfg.consumption_week_entity, (v) => this._set('consumption_week_entity', v), ['sensor'], 'House Consumption This Week')}
      ${this._entityPicker(cfg.export_week_entity,      (v) => this._set('export_week_entity', v),      ['sensor'], 'Grid Export This Week')}

      ${this._groupLabel('Chart — Month data')}
      ${this._entityPicker(cfg.production_month_entity,  (v) => this._set('production_month_entity', v),  ['sensor'], 'PV Production This Month')}
      ${this._entityPicker(cfg.consumption_month_entity, (v) => this._set('consumption_month_entity', v), ['sensor'], 'House Consumption This Month')}
      ${this._entityPicker(cfg.export_month_entity,      (v) => this._set('export_month_entity', v),      ['sensor'], 'Grid Export This Month')}
    `;
  }

  _inverterContent() {
    const cfg = this._config;
    return html`
      ${this._toggle('Show Inverter detail section', cfg.show_inverter, (v) => this._set('show_inverter', v))}

      ${this._groupLabel('PV Strings')}
      ${this._entityPicker(cfg.pv1_power_entity,   (v) => this._set('pv1_power_entity', v),   ['sensor'], 'PV1 Power (kW)')}
      ${this._entityPicker(cfg.pv1_voltage_entity, (v) => this._set('pv1_voltage_entity', v), ['sensor'], 'PV1 Voltage (V)')}
      ${this._entityPicker(cfg.pv1_current_entity, (v) => this._set('pv1_current_entity', v), ['sensor'], 'PV1 Current (A)')}
      ${this._entityPicker(cfg.pv2_power_entity,   (v) => this._set('pv2_power_entity', v),   ['sensor'], 'PV2 Power (kW)')}
      ${this._entityPicker(cfg.pv2_voltage_entity, (v) => this._set('pv2_voltage_entity', v), ['sensor'], 'PV2 Voltage (V)')}
      ${this._entityPicker(cfg.pv2_current_entity, (v) => this._set('pv2_current_entity', v), ['sensor'], 'PV2 Current (A)')}

      ${this._groupLabel('Grid Connection')}
      ${this._entityPicker(cfg.phase_a_voltage_entity,      (v) => this._set('phase_a_voltage_entity', v),      ['sensor'], 'Phase A Voltage (V)')}
      ${this._entityPicker(cfg.phase_b_voltage_entity,      (v) => this._set('phase_b_voltage_entity', v),      ['sensor'], 'Phase B Voltage (V)')}
      ${this._entityPicker(cfg.phase_c_voltage_entity,      (v) => this._set('phase_c_voltage_entity', v),      ['sensor'], 'Phase C Voltage (V)')}
      ${this._entityPicker(cfg.grid_current_entity,         (v) => this._set('grid_current_entity', v),         ['sensor'], 'Grid Current (A)')}
      ${this._entityPicker(cfg.phase_b_current_entity,      (v) => this._set('phase_b_current_entity', v),      ['sensor'], 'Phase B Current (A)')}
      ${this._entityPicker(cfg.phase_c_current_entity,      (v) => this._set('phase_c_current_entity', v),      ['sensor'], 'Phase C Current (A)')}
      ${this._entityPicker(cfg.grid_frequency_entity,       (v) => this._set('grid_frequency_entity', v),       ['sensor'], 'Grid Frequency (Hz)')}
      ${this._entityPicker(cfg.power_factor_entity,         (v) => this._set('power_factor_entity', v),         ['sensor'], 'Power Factor')}
      ${this._entityPicker(cfg.insulation_resistance_entity,(v) => this._set('insulation_resistance_entity', v),['sensor'], 'Insulation Resistance (MΩ)')}

      ${this._groupLabel('Temperature')}
      ${this._entityPicker(cfg.internal_temperature_entity, (v) => this._set('internal_temperature_entity', v), ['sensor'], 'Internal Temperature (°C)')}
    `;
  }

  _gridContent() {
    const cfg = this._config;
    return html`
      ${this._toggle('Show Grid & House Load detail section', cfg.show_grid, (v) => this._set('show_grid', v))}

      ${this._groupLabel('Grid Consumption History')}
      ${this._entityPicker(cfg.grid_consumption_today_entity,    (v) => this._set('grid_consumption_today_entity', v),    ['sensor'], 'Grid Consumption Today (kWh)')}
      ${this._entityPicker(cfg.grid_consumption_week_entity,     (v) => this._set('grid_consumption_week_entity', v),     ['sensor'], 'Grid Consumption This Week')}
      ${this._entityPicker(cfg.grid_consumption_month_entity,    (v) => this._set('grid_consumption_month_entity', v),    ['sensor'], 'Grid Consumption This Month')}
      ${this._entityPicker(cfg.grid_consumption_year_entity,     (v) => this._set('grid_consumption_year_entity', v),     ['sensor'], 'Grid Consumption This Year')}
      ${this._entityPicker(cfg.grid_consumption_lifetime_entity, (v) => this._set('grid_consumption_lifetime_entity', v), ['sensor'], 'Grid Consumption Lifetime')}

      ${this._groupLabel('Grid Injection (Export) History')}
      ${this._entityPicker(cfg.grid_injection_today_entity,    (v) => this._set('grid_injection_today_entity', v),    ['sensor'], 'Grid Injection Today (kWh)')}
      ${this._entityPicker(cfg.grid_injection_week_entity,     (v) => this._set('grid_injection_week_entity', v),     ['sensor'], 'Grid Injection This Week')}
      ${this._entityPicker(cfg.grid_injection_month_entity,    (v) => this._set('grid_injection_month_entity', v),    ['sensor'], 'Grid Injection This Month')}
      ${this._entityPicker(cfg.grid_injection_year_entity,     (v) => this._set('grid_injection_year_entity', v),     ['sensor'], 'Grid Injection This Year')}
      ${this._entityPicker(cfg.grid_injection_lifetime_entity, (v) => this._set('grid_injection_lifetime_entity', v), ['sensor'], 'Grid Injection Lifetime')}

      ${this._groupLabel('House Load History')}
      ${this._entityPicker(cfg.house_load_today_entity,    (v) => this._set('house_load_today_entity', v),    ['sensor'], 'House Load Today (kWh)')}
      ${this._entityPicker(cfg.house_load_week_entity,     (v) => this._set('house_load_week_entity', v),     ['sensor'], 'House Load This Week')}
      ${this._entityPicker(cfg.house_load_month_entity,    (v) => this._set('house_load_month_entity', v),    ['sensor'], 'House Load This Month')}
      ${this._entityPicker(cfg.house_load_year_entity,     (v) => this._set('house_load_year_entity', v),     ['sensor'], 'House Load This Year')}
      ${this._entityPicker(cfg.house_load_lifetime_entity, (v) => this._set('house_load_lifetime_entity', v), ['sensor'], 'House Load Lifetime')}
    `;
  }

  _panelsContent() {
    const cfg = this._config;
    return html`
      ${this._toggle('Show Panel Production & Forecast section', cfg.show_panels, (v) => this._set('show_panels', v))}

      ${this._groupLabel('Live & Forecast')}
      ${this._entityPicker(cfg.panel_production_power_entity, (v) => this._set('panel_production_power_entity', v), ['sensor'], 'Panel Production Power (kW)')}
      ${this._entityPicker(cfg.pv_forecasted_today_entity,    (v) => this._set('pv_forecasted_today_entity', v),    ['sensor'], 'PV Forecasted Today (kWh)')}
      ${this._entityPicker(cfg.pv_remaining_today_entity,     (v) => this._set('pv_remaining_today_entity', v),     ['sensor'], 'PV Remaining Today (kWh)')}

      ${this._groupLabel('Production History')}
      ${this._entityPicker(cfg.panel_production_today_entity,    (v) => this._set('panel_production_today_entity', v),    ['sensor'], 'Panel Production Today')}
      ${this._entityPicker(cfg.panel_production_week_entity,     (v) => this._set('panel_production_week_entity', v),     ['sensor'], 'Panel Production This Week')}
      ${this._entityPicker(cfg.panel_production_month_entity,    (v) => this._set('panel_production_month_entity', v),    ['sensor'], 'Panel Production This Month')}
      ${this._entityPicker(cfg.panel_production_year_entity,     (v) => this._set('panel_production_year_entity', v),     ['sensor'], 'Panel Production This Year')}
      ${this._entityPicker(cfg.panel_production_lifetime_entity, (v) => this._set('panel_production_lifetime_entity', v), ['sensor'], 'Panel Production Lifetime')}

      ${this._groupLabel('Production → Self-Consumed')}
      ${this._entityPicker(cfg.panel_production_consumption_today_entity,     (v) => this._set('panel_production_consumption_today_entity', v),     ['sensor'], 'Production Consumption Today')}
      ${this._entityPicker(cfg.panel_production_consumption_week_entity,      (v) => this._set('panel_production_consumption_week_entity', v),      ['sensor'], 'Production Consumption This Week')}
      ${this._entityPicker(cfg.panel_production_consumption_month_entity,     (v) => this._set('panel_production_consumption_month_entity', v),     ['sensor'], 'Production Consumption This Month')}
      ${this._entityPicker(cfg.panel_production_consumption_year_entity,      (v) => this._set('panel_production_consumption_year_entity', v),      ['sensor'], 'Production Consumption This Year')}
      ${this._entityPicker(cfg.panel_production_consumption_lifetime_entity,  (v) => this._set('panel_production_consumption_lifetime_entity', v),  ['sensor'], 'Production Consumption Lifetime')}
    `;
  }

  _ratiosContent() {
    const cfg = this._config;
    return html`
      ${this._toggle('Show Self-Consumption Ratios section', cfg.show_ratios, (v) => this._set('show_ratios', v))}

      ${this._groupLabel('By Load')}
      ${this._entityPicker(cfg.sc_ratio_load_today_entity,    (v) => this._set('sc_ratio_load_today_entity', v),    ['sensor'], 'Self-Consumption Ratio By Load Today (%)')}
      ${this._entityPicker(cfg.sc_ratio_load_week_entity,     (v) => this._set('sc_ratio_load_week_entity', v),     ['sensor'], 'Self-Consumption Ratio By Load Week')}
      ${this._entityPicker(cfg.sc_ratio_load_month_entity,    (v) => this._set('sc_ratio_load_month_entity', v),    ['sensor'], 'Self-Consumption Ratio By Load Month')}
      ${this._entityPicker(cfg.sc_ratio_load_year_entity,     (v) => this._set('sc_ratio_load_year_entity', v),     ['sensor'], 'Self-Consumption Ratio By Load Year')}
      ${this._entityPicker(cfg.sc_ratio_load_lifetime_entity, (v) => this._set('sc_ratio_load_lifetime_entity', v), ['sensor'], 'Self-Consumption Ratio By Load Lifetime')}

      ${this._groupLabel('By Production')}
      ${this._entityPicker(cfg.sc_ratio_prod_today_entity,    (v) => this._set('sc_ratio_prod_today_entity', v),    ['sensor'], 'Self-Consumption Ratio By Production Today (%)')}
      ${this._entityPicker(cfg.sc_ratio_prod_week_entity,     (v) => this._set('sc_ratio_prod_week_entity', v),     ['sensor'], 'Self-Consumption Ratio By Production Week')}
      ${this._entityPicker(cfg.sc_ratio_prod_month_entity,    (v) => this._set('sc_ratio_prod_month_entity', v),    ['sensor'], 'Self-Consumption Ratio By Production Month')}
      ${this._entityPicker(cfg.sc_ratio_prod_year_entity,     (v) => this._set('sc_ratio_prod_year_entity', v),     ['sensor'], 'Self-Consumption Ratio By Production Year')}
      ${this._entityPicker(cfg.sc_ratio_prod_lifetime_entity, (v) => this._set('sc_ratio_prod_lifetime_entity', v), ['sensor'], 'Self-Consumption Ratio By Production Lifetime')}
    `;
  }

  _diagnosticsContent() {
    const cfg = this._config;
    return html`
      ${this._toggle('Show Diagnostics section', cfg.show_diagnostics, (v) => this._set('show_diagnostics', v))}
      ${this._entityPicker(cfg.inverter_status_entity,       (v) => this._set('inverter_status_entity', v),       ['sensor'],                          'Inverter Status')}
      ${this._entityPicker(cfg.inverter_output_mode_entity,  (v) => this._set('inverter_output_mode_entity', v),  ['sensor'],                          'Inverter Output Mode')}
      ${this._entityPicker(cfg.inverter_last_updated_entity, (v) => this._set('inverter_last_updated_entity', v), ['sensor'],                          'Inverter Last Updated (timestamp)')}
      ${this._entityPicker(cfg.inverter_start_time_entity,   (v) => this._set('inverter_start_time_entity', v),   ['sensor'],                          'Inverter Start Time (timestamp)')}
    `;
  }

  render() {
    try {
      if (!this._config) return html``;
      return html`
        <div class="ed-root">
          ${this._section('header',      '☀️ Header',                        undefined, this._headerContent())}
          ${this._section('flow',        '⚡ Flow Diagram & Chart',           undefined, this._flowContent())}
          ${this._section('inverter',    '🔌 Inverter Detail',               undefined, this._inverterContent())}
          ${this._section('grid',        '🌐 Grid & House Load Detail',       undefined, this._gridContent())}
          ${this._section('panels',      '☀️ Panel Production & Forecast',    undefined, this._panelsContent())}
          ${this._section('ratios',      '% Self-Consumption Ratios',         undefined, this._ratiosContent())}
          ${this._section('diagnostics', '🔧 Diagnostics',                   undefined, this._diagnosticsContent())}
        </div>
      `;
    } catch (err) {
      console.error('[FUSIONSOLAR-CARD editor error]', err);
      return html`<div style="padding:16px;color:#ef4444;font-size:12px;font-family:monospace;white-space:pre-wrap">Editor error — check browser console:\n${err && err.message ? err.message : String(err)}</div>`;
    }
  }

  static get styles() {
    return css`
      :host { display: block; font-family: 'Segoe UI', system-ui, sans-serif; }
      .ed-root { display: flex; flex-direction: column; padding: 8px 0; }

      .ed-label { display: block; font-size: 12px; font-weight: 500; color: var(--primary-text-color, rgba(255,255,255,.7)); margin-bottom: 6px; letter-spacing: .2px; }
      .ed-field { margin-bottom: 12px; }

      .ed-input {
        width: 100%; padding: 10px 12px; font-size: 14px; font-family: inherit;
        border: 1px solid var(--divider-color, rgba(255,255,255,.1));
        border-radius: 8px;
        background: var(--secondary-background-color, rgba(255,255,255,.04));
        color: var(--primary-text-color, #fff);
        transition: border-color .15s; box-sizing: border-box;
      }
      .ed-input:focus { outline: none; border-color: var(--primary-color, #4fa3e0); }

      .hint { font-size: 12px; color: var(--secondary-text-color, rgba(255,255,255,.5)); margin: 0 0 10px; line-height: 1.5; }
      .hint-group { font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--primary-color, #e07c4f); margin: 10px 0 6px; }

      ha-entity-picker, ha-icon-picker { display: block; width: 100%; }

      .ed-section { background: var(--secondary-background-color, rgba(255,255,255,.025)); border: 1px solid var(--divider-color, rgba(255,255,255,.06)); border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
      .ed-section-header { padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; transition: background .15s; }
      .ed-section-header:hover { background: rgba(255,255,255,.03); }
      .ed-section-title { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 500; color: var(--primary-text-color, #fff); }
      .ed-section-count { font-size: 11px; font-weight: 500; color: var(--secondary-text-color, rgba(255,255,255,.4)); background: rgba(255,255,255,.05); padding: 2px 8px; border-radius: 10px; }
      .ed-section-arrow { color: var(--secondary-text-color, rgba(255,255,255,.4)); font-size: 12px; transition: transform .2s; }
      .ed-section.open .ed-section-arrow { transform: rotate(180deg); }
      .ed-section-body { padding: 0 14px; }
      .ed-section.open .ed-section-body { padding: 4px 14px 14px; }

      /* Toggle */
      .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; margin-bottom: 10px; }
      .toggle-label { font-size: 13px; color: var(--primary-text-color, rgba(255,255,255,.85)); }
      .toggle-wrap { position: relative; display: inline-block; width: 40px; height: 22px; }
      .toggle-wrap input { opacity: 0; width: 0; height: 0; }
      .toggle-slider { position: absolute; inset: 0; background: rgba(255,255,255,.15); border-radius: 11px; transition: background .2s; cursor: pointer; }
      .toggle-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .2s; }
      input:checked + .toggle-slider { background: var(--primary-color, #e07c4f); }
      input:checked + .toggle-slider::before { transform: translateX(18px); }

      /* Segmented control */
      .segmented { display: flex; border: 1px solid var(--divider-color, rgba(255,255,255,.1)); border-radius: 8px; overflow: hidden; }
      .seg-opt { flex: 1; padding: 8px 4px; font-size: 12px; text-align: center; cursor: pointer; color: var(--secondary-text-color, rgba(255,255,255,.5)); transition: background .15s, color .15s; }
      .seg-opt:hover { background: rgba(255,255,255,.04); }
      .seg-opt.active { background: var(--primary-color, #e07c4f); color: #fff; font-weight: 500; }
    `;
  }
}

customElements.define('fusionsolar-card-editor', FusionSolarCardEditor);

console.info(
  '%c FUSIONSOLAR-CARD-EDITOR %c loaded ',
  'background:#00f5ff;color:#020610;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px;',
  'background:#020610;color:#00f5ff;font-weight:600;padding:2px 6px;border-radius:0 4px 4px 0;'
);

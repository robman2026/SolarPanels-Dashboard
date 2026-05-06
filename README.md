# ☀️ FusionSolar Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
[![GitHub release](https://img.shields.io/github/release/robman2026/fusionsolar-card.svg)](https://github.com/robman2026/fusionsolar-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A single-file animated Lovelace card for **Huawei SUN2000** inverters integrated via the [FusionSolar](https://github.com/wlcrs/huawei_solar) / Huawei Solar integration.

---

## Features

- **Animated SVG flow diagram** — glowing nodes for Solar, Grid, Battery (optional) and House with flowing dashed energy paths
- **Arc gauges** — Solar · House · Grid · Battery % with neon glow accent lines
- **Chart.js energy history** — Day / Week / Month line chart (PV production, consumption, grid export)
- **kWh summary** — Generated / Consumed / Exported cards below the chart
- **Self-consumption rate bar**
- **Collapsible detail sections:**
  - 🔌 Inverter — PV1/PV2 strings, phase voltages & currents, grid frequency, power factor, insulation resistance, internal temperature
  - 🌐 Grid & House Load — consumption, injection (export) and house load history (Today / Week / Month / Year / Lifetime)
  - ☀️ Panel Production & Forecast — live power, PV forecast, remaining today, production history, self-consumed totals
  - % Self-Consumption Ratios — by load and by production, with mini progress bars
  - 🔧 Diagnostics — inverter status, output mode, last updated, start time
- **Visual editor** — all entities configurable via `ha-entity-picker` searchable dropdowns, no YAML required
- **All entities optional** — the card hides any tile or section where no entity is configured
- **Frosted dark glass UI** — deep space background with neon cyan / lime / magenta / violet accent palette
- **Fully responsive** — adapts from full desktop width down to narrow mobile columns

---

## Screenshots

> *(Add screenshots here after installing)*

---

## Requirements

- Home Assistant **2023.9.0** or later
- [HACS](https://hacs.xyz/) installed
- [Huawei Solar](https://github.com/wlcrs/huawei_solar) integration (or any integration that exposes the same sensor entities)

---

## Installation

### Via HACS (recommended)

1. Open HACS → **Frontend**
2. Click the **⋮** menu → **Custom repositories**
3. Add `https://github.com/robman2026/fusionsolar-card` as category **Lovelace**
4. Search for **FusionSolar Card** and click **Install**
5. Reload your browser

### Manual

1. Download `fusionsolar-card.js` from the [latest release](https://github.com/robman2026/fusionsolar-card/releases/latest)
2. Copy it to `/config/www/fusionsolar-card.js`
3. In HA → **Settings → Dashboards → Resources**, add:
   - URL: `/local/fusionsolar-card.js`
   - Type: **JavaScript module**
4. Reload your browser

---

## Usage

Add via the Lovelace UI (click **+ Add Card** → search *FusionSolar*) or manually in YAML:

```yaml
type: custom:fusionsolar-card
card_title: SUN2000 · FusionSolar
card_subtitle: Huawei inverter · Home Assistant

# ── Flow diagram + arc gauges ──────────────────────────────────────────────
solar_power_entity:      sensor.panel_production_power
house_power_entity:      sensor.house_load_power
grid_power_entity:       sensor.grid_consumption_power
battery_soc_entity:      sensor.battery_state_of_capacity   # optional
self_consumption_entity: sensor.self_consumption_ratio_by_production_today  # optional

# ── Chart — Day data ───────────────────────────────────────────────────────
production_today_entity:  sensor.panel_production_today
consumption_today_entity: sensor.house_load_today
export_today_entity:      sensor.grid_injection_today

# ── Chart — Week data ──────────────────────────────────────────────────────
production_week_entity:   sensor.panel_production_week
consumption_week_entity:  sensor.house_load_week
export_week_entity:       sensor.grid_injection_week

# ── Chart — Month data ─────────────────────────────────────────────────────
production_month_entity:  sensor.panel_production_month
consumption_month_entity: sensor.house_load_month
export_month_entity:      sensor.grid_injection_month

# ── Inverter detail section ────────────────────────────────────────────────
show_inverter: true
pv1_power_entity:             sensor.inverter_pv1_power
pv1_voltage_entity:           sensor.inverter_pv1_voltage
pv1_current_entity:           sensor.inverter_pv1_current
pv2_power_entity:             sensor.inverter_pv2_power
pv2_voltage_entity:           sensor.inverter_pv2_voltage
pv2_current_entity:           sensor.inverter_pv2_current
phase_a_voltage_entity:       sensor.inverter_phase_a_voltage
phase_b_voltage_entity:       sensor.inverter_phase_b_voltage
phase_c_voltage_entity:       sensor.inverter_phase_c_voltage
grid_current_entity:          sensor.inverter_grid_current
phase_b_current_entity:       sensor.inverter_phase_b_current
phase_c_current_entity:       sensor.inverter_phase_c_current
grid_frequency_entity:        sensor.inverter_grid_frequency
power_factor_entity:          sensor.inverter_power_factor
insulation_resistance_entity: sensor.inverter_insulation_resistance
internal_temperature_entity:  sensor.inverter_internal_temperature

# ── Grid & House Load detail ───────────────────────────────────────────────
show_grid: true
grid_consumption_today_entity:    sensor.grid_consumption_today
grid_consumption_week_entity:     sensor.grid_consumption_week
grid_consumption_month_entity:    sensor.grid_consumption_month
grid_consumption_year_entity:     sensor.grid_consumption_year
grid_consumption_lifetime_entity: sensor.grid_consumption_lifetime
grid_injection_today_entity:      sensor.grid_injection_today
grid_injection_week_entity:       sensor.grid_injection_week
grid_injection_month_entity:      sensor.grid_injection_month
grid_injection_year_entity:       sensor.grid_injection_year
grid_injection_lifetime_entity:   sensor.grid_injection_lifetime
house_load_today_entity:          sensor.house_load_today
house_load_week_entity:           sensor.house_load_week
house_load_month_entity:          sensor.house_load_month
house_load_year_entity:           sensor.house_load_year
house_load_lifetime_entity:       sensor.house_load_lifetime

# ── Panel Production & Forecast detail ────────────────────────────────────
show_panels: true
panel_production_power_entity:              sensor.panel_production_power
pv_forecasted_today_entity:                 sensor.pv_forecasted_today
pv_remaining_today_entity:                  sensor.pv_remaining_today
panel_production_today_entity:              sensor.panel_production_today
panel_production_week_entity:               sensor.panel_production_week
panel_production_month_entity:              sensor.panel_production_month
panel_production_year_entity:               sensor.panel_production_year
panel_production_lifetime_entity:           sensor.panel_production_lifetime
panel_production_consumption_today_entity:  sensor.panel_production_consumption_today
panel_production_consumption_week_entity:   sensor.panel_production_consumption_week
panel_production_consumption_month_entity:  sensor.panel_production_consumption_month
panel_production_consumption_year_entity:   sensor.panel_production_consumption_year
panel_production_consumption_lifetime_entity: sensor.panel_production_consumption_lifetime

# ── Self-Consumption Ratios detail ─────────────────────────────────────────
show_ratios: true
sc_ratio_load_today_entity:       sensor.self_consumption_ratio_by_load_today
sc_ratio_load_week_entity:        sensor.self_consumption_ratio_by_load_week
sc_ratio_load_month_entity:       sensor.self_consumption_ratio_by_load_month
sc_ratio_load_year_entity:        sensor.self_consumption_ratio_by_load_year
sc_ratio_load_lifetime_entity:    sensor.self_consumption_ratio_by_load_lifetime
sc_ratio_prod_today_entity:       sensor.self_consumption_ratio_by_production_today
sc_ratio_prod_week_entity:        sensor.self_consumption_ratio_by_production_week
sc_ratio_prod_month_entity:       sensor.self_consumption_ratio_by_production_month
sc_ratio_prod_year_entity:        sensor.self_consumption_ratio_by_production_year
sc_ratio_prod_lifetime_entity:    sensor.self_consumption_ratio_by_production_lifetime

# ── Diagnostics detail ─────────────────────────────────────────────────────
show_diagnostics: true
inverter_status_entity:       sensor.inverter_status
inverter_output_mode_entity:  sensor.inverter_output_mode
inverter_last_updated_entity: sensor.inverter_last_updated
inverter_start_time_entity:   sensor.inverter_start_time
```

---

## Configuration Reference

All entity fields are **optional**. The card automatically hides any tile or section where no entity is configured.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `card_title` | string | `SUN2000 · FusionSolar` | Header title |
| `card_subtitle` | string | `Huawei inverter · Home Assistant` | Header subtitle |
| `solar_power_entity` | entity | — | Live PV production power (kW) — drives flow diagram + Solar arc gauge |
| `house_power_entity` | entity | — | Live house load power (kW) — drives Home node + arc gauge |
| `grid_power_entity` | entity | — | Live grid consumption power (kW) — drives Grid node + arc gauge |
| `battery_soc_entity` | entity | — | Battery state of charge % — optional, shows Battery node when set |
| `self_consumption_entity` | entity | — | Self-consumption rate % — optional, powers the SC bar |
| `production_today_entity` | entity | — | PV production today (kWh) — Day chart + summary |
| `consumption_today_entity` | entity | — | House consumption today (kWh) |
| `export_today_entity` | entity | — | Grid export today (kWh) |
| `production_week_entity` | entity | — | PV production this week |
| `consumption_week_entity` | entity | — | House consumption this week |
| `export_week_entity` | entity | — | Grid export this week |
| `production_month_entity` | entity | — | PV production this month |
| `consumption_month_entity` | entity | — | House consumption this month |
| `export_month_entity` | entity | — | Grid export this month |
| `show_inverter` | boolean | `true` | Show/hide the Inverter detail section |
| `pv1_power_entity` … `pv2_current_entity` | entity | — | PV string sensors |
| `phase_a_voltage_entity` … `insulation_resistance_entity` | entity | — | Grid connection sensors |
| `internal_temperature_entity` | entity | — | Inverter internal temperature |
| `show_grid` | boolean | `true` | Show/hide the Grid & House Load detail section |
| `grid_consumption_*_entity` | entity | — | Grid consumption history (today/week/month/year/lifetime) |
| `grid_injection_*_entity` | entity | — | Grid injection history |
| `house_load_*_entity` | entity | — | House load history |
| `show_panels` | boolean | `true` | Show/hide the Panel Production & Forecast detail section |
| `panel_production_*_entity` | entity | — | Panel production history |
| `pv_forecasted_today_entity` | entity | — | PV forecast for today |
| `pv_remaining_today_entity` | entity | — | PV remaining today |
| `panel_production_consumption_*_entity` | entity | — | Self-consumed production totals |
| `show_ratios` | boolean | `true` | Show/hide the Self-Consumption Ratios section |
| `sc_ratio_load_*_entity` | entity | — | Self-consumption ratio by load |
| `sc_ratio_prod_*_entity` | entity | — | Self-consumption ratio by production |
| `show_diagnostics` | boolean | `true` | Show/hide the Diagnostics section |
| `inverter_status_entity` | entity | — | Inverter status string |
| `inverter_output_mode_entity` | entity | — | Output mode (e.g. three-phase four-wire) |
| `inverter_last_updated_entity` | entity | — | Last communication timestamp |
| `inverter_start_time_entity` | entity | — | Inverter start time today |

---

## Related

- [Huawei Solar integration](https://github.com/wlcrs/huawei_solar) — the HA integration this card is built for
- [Kitchen Card](https://github.com/robman2026/kitchen-card) — sister card by the same author

---

## License

MIT © robman2026

# Changelog

All notable changes to FusionSolar Card will be documented in this file.

## [1.0.0] - 2026-05-06

### Added
- Initial release
- Animated SVG flow diagram (Solar · Grid · Battery · House) with glowing neon nodes and flowing dashed energy paths
- Battery node is optional — appears automatically when `battery_soc_entity` is configured
- Arc gauge metric strip (Solar / House / Grid / Battery %)
- Chart.js energy history with Day / Week / Month tabs
- kWh summary cards (Generated / Consumed / Exported)
- Self-consumption rate bar
- Collapsible detail sections: Inverter, Grid & House Load, Panel Production & Forecast, Self-Consumption Ratios, Diagnostics
- Visual editor with `ha-entity-picker` searchable entity dropdowns (same pattern as kitchen-card)
- All entities optional — card hides any tile or section automatically when entity is not configured
- Frosted dark glass UI with futuristic neon color palette
- Fully responsive layout (desktop → tablet → mobile)
- HACS support

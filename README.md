# ioBroker.vis-2-widgets-zuhause

VIS-2 widget set for a wall tablet in a dark design: tiles with five behaviours, PIN dialog,
weather, value card, school substitution plan and card backgrounds.

Install from GitHub (no npm release): `iob url https://github.com/Sven-83/ioBroker.vis-2-widgets-zuhause`,
then restart `vis-2`.

German documentation: [docs/de/README.md](docs/de/README.md).

## Widgets

| Widget | Purpose |
|---|---|
| Kachel | 88 × 88 tile: `schalter`, `schalter-pin`, `status-aus`, `status`, `status-warnung`; badges (lock, CO2, light), diagnosis (no reception, low battery, stale value), ack feedback, long press popup, animations |
| PIN-Dialog | number pad for `schalter-pin` tiles; the PIN is checked by a script, never in the browser |
| Wetter | up to 7 days, temperature + WMO weather code (e.g. open-meteo-weather) |
| Werte-Karte | list of values (temperatures, energy), optional footer and tap target view, placeholder variant |
| Schul-Liste | substitution plan of selected classes (JSON data points written by a script) |
| Karte | card background with group titles and divider lines |
| Grundriss | floor plan SVG with device pins (JSON list), light glow per zone, blind daylight, red tint of open windows; brightness and height popups |
| Etagen-Panel | side panel of a floor plan: light, sockets, blinds, security |
| Klima | floor heating tile with setpoint popup |
| Kopfzeile | page head: small line, title, view tabs, date and clock |
| Legende | one line legend of the tile signs |

The colours come from CSS variables (`--card`, `--sw-on`, …) with dark defaults, so a project CSS can
theme all widgets at once.

## Development

```
npm run npm      # install root + src-widgets
npm test         # unit tests of the logic (node:test)
npm run lint
npm run build    # vite build -> widgets/vis-2-widgets-zuhause (committed)
```

## License

MIT, see [LICENSE](LICENSE). Fonts: Barlow (SIL Open Font License, src-widgets/src/fonts/OFL.txt).

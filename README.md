# HALCYON HEAT
[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tarekujjaman/halcyon-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tarekujjaman/halcyon-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 3D open-world crime game set in Halcyon Bay, a sun-soaked coastal city at golden hour. You are
Marisol "Sol" Vega, a getaway driver back in town to help her uncle Teo's body shop survive Kane
Okafor's crew. Five districts (Coral Strand, Glasswater Downtown, Neon Row, Palmetto Heights,
Saltmarsh Docks), traffic and pedestrians, cars to steal and drift, a five-star wanted system with
cruisers, roadblocks and a helicopter, six story missions, street races, taxi fares, sea-glass
shards, resprays, safehouses, a day-night cycle, three procedural radio stations and three save slots.
Built on three.js alone; every texture is painted on a canvas and every sound is synthesized.

## Controls

| On foot | |
| --- | --- |
| W A S D, Shift, Space | move, run, jump |
| Mouse (click to lock) | look |
| Left / right click | punch or fire / aim |
| 1-4, wheel, Q | weapon, reload |
| F, E | enter or steal a car, interact |

| Driving | |
| --- | --- |
| W / S, A / D | accelerate or brake, steer |
| Space | handbrake (drift) |
| F, R, H | get out, radio station, horn |

M opens the map (click to set a waypoint), Esc pauses, F5 quick-saves. Save at safehouses or from
the pause menu; the game autosaves after each mission and "Continue" loads the latest save.

## Run it

```
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. `node tools/shoot.mjs` retakes the screenshots
in headless Chrome and `node tools/playtest.mjs` plays through the core loop and checks for errors.
`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` builds the entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y2gg1pq1&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

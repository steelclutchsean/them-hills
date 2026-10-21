# Balance — first three hours

Headless run of `node tools/balance/simulate.mjs`. The script copies the live prices, the assayer quote, and the method yield scales. It exits 2 if any purchase that becomes the goal at or before minute 180 takes less than 5 or more than 15 minutes. The run that produced this page exited 0.

## Quote

Spot $2500/ozt, town bias 1, assayer mix `0.85×0.85 + 0.13×0.92 + 0.02×1 = 0.8621`.

**$69.29 per gram.**

A run is `0.18g × digFactor × skill × comfort × methodScale × methodTier × geology`. Panning uses geology and a depleted-site dig factor of 0.82. Machines use comfort and the method tier, not the geology mark. Cycle seconds already include a walk back to sell.

| Method | Scale | Tier | Steady / rusher / reader seconds |
| --- | ---: | ---: | --- |
| Pan | 1.00 | 1.00 | 34 / 42 / 30 |
| Rocker | 1.65 | 1.25 | 20 / 26 / 18 |
| Sluice | 2.20 | 1.45 | 24 / 30 / 22 |
| Long tom | 2.75 | 1.55 | 28 / 34 / 24 |
| Monitor | 3.90 | 1.70 | 32 / 40 / 28 |

## Styles

Everyone works the marked creek. The spread is wash skill, whether the tells were read, and how long a trip takes.

| Style | Skill | Geology (pan only) | Comfort | Clock starts |
| --- | ---: | ---: | ---: | ---: |
| Steady | 1.22 | 1.15 | 1.08 | 6.0 min |
| Rusher | 1.00 | 1.05 | 1.00 | 5.4 min |
| Reader | 1.38 | 1.32 | 1.12 | 7.0 min |

The opening is not a store goal. First color is about two minutes, then the walk to the assayer, Pete's lesson, one sample, and the free first stake. Those beats sit inside the clock-start above and are meant to be shorter than five minutes. Wallet at the first sale: steady $15.50, rusher $10.74, reader $20.87.

## Purchase ladder

Gap is minutes from the moment the line becomes the next goal until cash (and the monitor's 8 gram hold) can pay it. Income steps up only when the method changes. Later rows are cash sinks on the monitor's rate, which is the slow case: shovel, classifier, pan, snuffer, detector, and gear tiers do raise live yield, and this sheet does not credit them. A player who buys those before the camp goals finishes the tail faster than the table. The five-minute floor is the number to watch, not the fifteen-minute ceiling.

### Steady — about $27/min on the pan, $204/min on the monitor

| Min | Gap | Goal | Earning with |
| ---: | ---: | --- | --- |
| 14.1 | 8.1 | Rocker box ($236) | pan |
| 22.3 | 8.3 | Sluice ($840) | rocker |
| 30.9 | 8.5 | Long tom ($1120) | sluice |
| 38.5 | 7.7 | Hire a hand ($1150) | tom |
| 47.5 | 9.0 | Monitor ($1350 + 8 g) | tom |
| 54.9 | 7.3 | Pick ($1500) | monitor |
| 63.2 | 8.3 | Rocker apron ($1700) | monitor |
| 72.0 | 8.8 | Power sluice ($1800) | monitor |
| 79.1 | 7.1 | Waders ($1450) | monitor |
| 87.4 | 8.3 | Double jack ($1700) | monitor |
| 95.0 | 7.6 | Full shovel ($1550) | monitor |
| 103.2 | 8.2 | Long shovel ($1680) | monitor |
| 111.0 | 7.7 | Classifier stack ($1580) | monitor |
| 119.4 | 8.4 | Five-stack ($1720) | monitor |
| 126.8 | 7.4 | Headlamp ($1520) | monitor |
| 134.2 | 7.3 | Snuffer vials ($1500) | monitor |
| 142.4 | 8.2 | Snuffer scale ($1680) | monitor |
| 150.2 | 7.8 | Detector ($1600) | monitor |
| 158.8 | 8.6 | Pinpointer ($1750) | monitor |
| 167.2 | 8.4 | Riffled pan ($1720) | monitor |
| 175.8 | 8.6 | Insulated gear ($1750) | monitor |
| 184.3 | 8.6 | Hard-rock kit ($1750) | monitor |

At minute 180 the hard-rock kit is still the open goal. Second claim through the hand dredge are still ahead, each another 8 minutes at this rate.

### Rusher — about $15/min on the pan, $124/min on the monitor

| Min | Gap | Goal | Earning with |
| ---: | ---: | --- | --- |
| 20.1 | 14.7 | Rocker box ($236) | pan |
| 34.2 | 14.1 | Sluice ($840) | rocker |
| 48.3 | 14.1 | Long tom ($1120) | sluice |
| 60.6 | 12.3 | Hire a hand ($1150) | tom |
| 75.0 | 14.4 | Monitor ($1350 + 8 g) | tom |
| 87.0 | 12.1 | Pick ($1500) | monitor |
| 100.8 | 13.7 | Rocker apron ($1700) | monitor |
| 115.3 | 14.5 | Power sluice ($1800) | monitor |
| 127.0 | 11.7 | Waders ($1450) | monitor |
| 140.7 | 13.7 | Double jack ($1700) | monitor |
| 153.2 | 12.5 | Full shovel ($1550) | monitor |
| 166.7 | 13.5 | Long shovel ($1680) | monitor |
| 179.4 | 12.7 | Classifier stack ($1580) | monitor |
| 193.3 | 13.9 | Five-stack ($1720) | monitor |

At minute 180 the five-stack is the open goal. The rest of the store, the claims, and the camp are still unpaid. This is the style the 15-minute cap is built for.

### Reader — about $42/min on the pan, $274/min on the monitor

| Min | Gap | Goal | Earning with |
| ---: | ---: | --- | --- |
| 12.2 | 5.2 | Rocker box ($236) | pan |
| 18.5 | 6.3 | Sluice ($840) | rocker |
| 25.2 | 6.7 | Long tom ($1120) | sluice |
| 30.8 | 5.6 | Hire a hand ($1150) | tom |
| 37.3 | 6.6 | Monitor ($1350 + 8 g) | tom |
| 42.8 | 5.5 | Pick ($1500) | monitor |
| 49.0 | 6.2 | Rocker apron ($1700) | monitor |
| 55.6 | 6.6 | Power sluice ($1800) | monitor |
| 60.9 | 5.3 | Waders ($1450) | monitor |
| 67.1 | 6.2 | Double jack ($1700) | monitor |
| 72.8 | 5.7 | Full shovel ($1550) | monitor |
| 78.9 | 6.1 | Long shovel ($1680) | monitor |
| 84.7 | 5.8 | Classifier stack ($1580) | monitor |
| 90.9 | 6.3 | Five-stack ($1720) | monitor |
| 96.5 | 5.5 | Headlamp ($1520) | monitor |
| 102.0 | 5.5 | Snuffer vials ($1500) | monitor |
| 108.1 | 6.1 | Snuffer scale ($1680) | monitor |
| 113.9 | 5.8 | Detector ($1600) | monitor |
| 120.3 | 6.4 | Pinpointer ($1750) | monitor |
| 126.6 | 6.3 | Riffled pan ($1720) | monitor |
| 133.0 | 6.4 | Insulated gear ($1750) | monitor |
| 139.4 | 6.4 | Hard-rock kit ($1750) | monitor |
| 145.4 | 6.0 | Second claim ($1650) | monitor |
| 152.0 | 6.6 | Third claim ($1800) | monitor |
| 158.2 | 6.2 | Lode filing ($1700) | monitor |
| 164.0 | 5.8 | Lean-to ($1600) | monitor |
| 170.4 | 6.4 | Cabin ($1750) | monitor |
| 176.6 | 6.1 | Cache ($1680) | monitor |
| 182.8 | 6.2 | Hand dredge ($1700) | monitor |

At minute 180 the hand dredge is still open (it became the goal at 176.6). It is the last box on the guided list. A reader who also stacks the live tier multipliers will clear it inside the hour and then has no guided purchase. That is the end of the authored ladder, not a hidden fourth hour of goals.

## What this sheet does not cover

- Coffee ($3), beans ($4), a canteen ($6), and nails ($8) are pocket goods. They are not the guided goal, and buying them does not move the tracker.
- Pan tier 2 stays $200 because the smoke test buys it from a $500 wallet and expects $290–$310 left. Buying it the moment the rocker is also affordable shortens that 5–15 minute rocker gap. The tracker still points at the rocker first.
- The first stake is free. The second is $1650 and the third is $1800.
- Weather, a jumper, a death, or a long walk are not in the clock. The curve is continuous work on the current best machine.
- Hire does not add a second earner in this model. It is a cash sink that keeps a person on the claim.

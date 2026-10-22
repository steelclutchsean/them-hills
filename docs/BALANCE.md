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

Gap is minutes from the moment the line becomes the next goal until cash (and the monitor's 8 gram hold) can pay it. Income steps up only when the method changes. The steel pan is bought while the rocker is still the method, so it does not raise the rate in this sheet. Later rows are cash sinks on the monitor's rate, which is the slow case: shovel, classifier, pan, snuffer, detector, and gear tiers do raise live yield, and this sheet does not credit them. A player who buys those before the camp goals finishes the tail faster than the table. The five-minute floor is the number to watch, not the fifteen-minute ceiling.

### Steady — about $27/min on the pan, $102/min on the rocker, $204/min on the monitor

| Min | Gap | Goal | Earning with |
| ---: | ---: | --- | --- |
| 14.1 | 8.1 | Rocker box ($236) | pan |
| 21.4 | 7.4 | Steel pan ($750) | rocker |
| 29.7 | 8.3 | Sluice ($840) | rocker |
| 38.2 | 8.5 | Long tom ($1120) | sluice |
| 45.9 | 7.7 | Hire a hand ($1150) | tom |
| 54.9 | 9.0 | Monitor ($1350 + 8 g) | tom |
| 62.2 | 7.3 | Pick ($1500) | monitor |
| 70.6 | 8.3 | Rocker apron ($1700) | monitor |
| 79.4 | 8.8 | Power sluice ($1800) | monitor |
| 86.5 | 7.1 | Waders ($1450) | monitor |
| 94.8 | 8.3 | Double jack ($1700) | monitor |
| 102.4 | 7.6 | Full shovel ($1550) | monitor |
| 110.6 | 8.2 | Long shovel ($1680) | monitor |
| 118.3 | 7.7 | Classifier stack ($1580) | monitor |
| 126.8 | 8.4 | Five-stack ($1720) | monitor |
| 134.2 | 7.4 | Headlamp ($1520) | monitor |
| 141.5 | 7.3 | Snuffer vials ($1500) | monitor |
| 149.8 | 8.2 | Snuffer scale ($1680) | monitor |
| 157.6 | 7.8 | Detector ($1600) | monitor |
| 166.2 | 8.6 | Pinpointer ($1750) | monitor |
| 174.6 | 8.4 | Riffled pan ($1720) | monitor |
| 183.1 | 8.6 | Insulated gear ($1750) | monitor |

At minute 180 the insulated gear is the open goal. The camp and the claims are still ahead.

### Rusher — about $15/min on the pan, $59/min on the rocker, $124/min on the monitor

| Min | Gap | Goal | Earning with |
| ---: | ---: | --- | --- |
| 20.1 | 14.7 | Rocker box ($236) | pan |
| 32.7 | 12.6 | Steel pan ($750) | rocker |
| 46.9 | 14.1 | Sluice ($840) | rocker |
| 60.9 | 14.1 | Long tom ($1120) | sluice |
| 73.2 | 12.3 | Hire a hand ($1150) | tom |
| 87.6 | 14.4 | Monitor ($1350 + 8 g) | tom |
| 99.7 | 12.1 | Pick ($1500) | monitor |
| 113.4 | 13.7 | Rocker apron ($1700) | monitor |
| 127.9 | 14.5 | Power sluice ($1800) | monitor |
| 139.6 | 11.7 | Waders ($1450) | monitor |
| 153.3 | 13.7 | Double jack ($1700) | monitor |
| 165.8 | 12.5 | Full shovel ($1550) | monitor |
| 179.3 | 13.5 | Long shovel ($1680) | monitor |
| 192.1 | 12.7 | Classifier stack ($1580) | monitor |

At minute 180 the classifier stack is the open goal. This is the style the 15-minute cap is built for. The steel pan at $750 is 12.6 minutes on the rocker, and the sluice after it is still 14.1.

### Reader — about $42/min on the pan, $133/min on the rocker, $274/min on the monitor

| Min | Gap | Goal | Earning with |
| ---: | ---: | --- | --- |
| 12.2 | 5.2 | Rocker box ($236) | pan |
| 17.8 | 5.7 | Steel pan ($750) | rocker |
| 24.2 | 6.3 | Sluice ($840) | rocker |
| 30.8 | 6.7 | Long tom ($1120) | sluice |
| 36.4 | 5.6 | Hire a hand ($1150) | tom |
| 43.0 | 6.6 | Monitor ($1350 + 8 g) | tom |
| 48.5 | 5.5 | Pick ($1500) | monitor |
| 54.7 | 6.2 | Rocker apron ($1700) | monitor |
| 61.3 | 6.6 | Power sluice ($1800) | monitor |
| 66.5 | 5.3 | Waders ($1450) | monitor |
| 72.8 | 6.2 | Double jack ($1700) | monitor |
| 78.4 | 5.7 | Full shovel ($1550) | monitor |
| 84.6 | 6.1 | Long shovel ($1680) | monitor |
| 90.3 | 5.8 | Classifier stack ($1580) | monitor |
| 96.6 | 6.3 | Five-stack ($1720) | monitor |
| 102.1 | 5.5 | Headlamp ($1520) | monitor |
| 107.6 | 5.5 | Snuffer vials ($1500) | monitor |
| 113.8 | 6.1 | Snuffer scale ($1680) | monitor |
| 119.6 | 5.8 | Detector ($1600) | monitor |
| 126.0 | 6.4 | Pinpointer ($1750) | monitor |
| 132.3 | 6.3 | Riffled pan ($1720) | monitor |
| 138.7 | 6.4 | Insulated gear ($1750) | monitor |
| 145.1 | 6.4 | Hard-rock kit ($1750) | monitor |
| 151.1 | 6.0 | Second claim ($1650) | monitor |
| 157.6 | 6.6 | Third claim ($1800) | monitor |
| 163.9 | 6.2 | Lode filing ($1700) | monitor |
| 169.7 | 5.8 | Lean-to ($1600) | monitor |
| 176.1 | 6.4 | Cabin ($1750) | monitor |
| 182.2 | 6.1 | Cache ($1680) | monitor |

At minute 180 the cache is the open goal. The hand dredge is the last box after it. A reader who also stacks the live tier multipliers clears the ladder sooner than this sheet.

## After the placer ladder

The sim keeps going once the guided ladder has passed minute 180. Those rows are not part of the 5–15 check. Timber ($160 for four sets), powder ($108), and stamp fees ($96) are pocket costs on purpose, the same way coffee is. A dry-week cut (×0.68) is applied to the powder row only, and the lease is priced at the gold-rush markup (×1.18 on $4200).

Hard-rock, once the ore is being milled, is modeled as scale 4.6, tier 1.55, 48 / 56 / 42 seconds. That is one drill, one blast, the muck, and the walk to the stamp mill.

| Style | Lease gap | Clock when the lease is paid | Earning |
| --- | ---: | ---: | --- |
| Steady | 33.8 min | 219.5 min | $146/min on the lode, after the rush markup |
| Rusher | 52.0 min | 248.0 min | $95/min |
| Reader | 25.2 min | 209.3 min | $196/min |

Standing with the town (20 loads milled and 3 timber sets) is the other ending. It spends the mill fees instead of the $4200, so it is the shorter clock if the stamps keep running. The sheet prices the buyout because that is the expensive door.

Flood, drought, the rush, and the town fire are not a second income curve. Flood walks the pay streak (the same shift rain already uses). Drought is the ×0.68 cut above. The rush raises store prices 18% and puts a jumper on an empty claim. The fire shuts the mill until the bucket line.

## What this sheet does not cover

- Coffee ($3), beans ($4), a canteen ($6), and nails ($8) are pocket goods. They are not the guided goal, and buying them does not move the tracker.
- Pan tier 2 is $750. It is the guided step after the rocker has been run and before the sluice. Putting it in front of the rocker, or pricing it near $230, pushes the rusher's rocker gap past 15 minutes. The smoke test reads this price from equipment config and funds the legacy wallet with that price plus a small headroom.
- The first stake is free. The second is $1650 and the third is $1800.
- Weather, a jumper, a death, or a long walk are not in the clock. The curve is continuous work on the current best machine.
- Hire does not add a second earner in this model. It is a cash sink that keeps a person on the claim.

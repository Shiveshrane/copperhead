# Brief: GNSS and LoRaWAN asset tracker

## What it is

A small asset tracker: gets a GNSS fix, reports position over LoRaWAN, and runs for two years on a primary cell while spending most of its life doing nothing. Two radios on one small board, both wanting the same power budget and the same clear sky.

## Must do

1. Acquire a GNSS fix (GPS plus at least one other constellation) and report position, fix quality, and satellite count.
2. Transmit over LoRaWAN on EU868 and US915, region selected in firmware, not in hardware.
3. Detect motion with an accelerometer and use it to decide when to wake, rather than waking on a fixed timer alone.
4. Measure battery voltage under load, not at rest.
5. Report temperature.
6. Provide a USB-C port for firmware update and factory provisioning only, not for normal operation.
7. Survive being potted.

## Budgets

- Sleep current, accelerometer active as a wake source: under 8uA.
- Energy per report cycle, from wake through fix through uplink to sleep: under 2.5 J at a 30 second time-to-fix.
- Battery: one 3.6V lithium thionyl chloride D cell, 19Ah (Tadiran TL-5930 class), with a supercapacitor or hybrid layer capacitor to handle pulse current.
- Target life: 2 years at 6 reports per day plus motion-triggered reports capped at 40 per day.
- LoRa transmit power: 14dBm EU868, 20dBm US915.
- Board area: 60mm x 30mm, including both antennas.
- Peak current drawn from the cell itself: under 100mA. The datasheet allows 230mA continuous and 500mA pulse, so this is a deliberate margin for passivation and end-of-life behaviour, not a hard cell limit. Treat it as a requirement anyway.

## Constraints

- Two RF chains on one board: GNSS receive at 1.575GHz and LoRa transmit at 868/915MHz. Antenna placement, isolation, and keepouts must be treated as a first-class layout constraint with the reasoning written down.
- LoRa transmit must not corrupt a GNSS fix in progress. State whether this is solved by scheduling, filtering, or isolation, and what that choice costs.
- 4-layer, controlled impedance, 50 ohm single-ended RF traces with a stated stackup.
- The cell cannot supply LoRa transmit pulses directly. The hybrid capacitor sizing must be calculated from the actual pulse profile, not guessed.
- Antennas: chip or PCB antennas, no connectors, since the unit is potted.
- Operating range: -20C to 60C. Note where the cell's own limits bind before the electronics do.

## Out of scope

- Cellular fallback.
- Rechargeable operation or solar.
- Cloud or network server side.
- Enclosure and potting process, though the design must state which components are sensitive to potting compound.

## Notes

This brief is deliberately over-constrained, and it is worth being precise about where, because the obvious suspect is not the culprit.

The two-year life is not the problem. 19Ah at 3.6V is about 246kJ, and 46 reports per day for 730 days is about 33,600 cycles. Even at 5J per cycle that is around 168kJ, plus roughly 1.8kJ of sleep current, which fits inside the cell's usable energy with margin.

The conflict is the 2.5J energy-per-cycle budget against the 30 second time-to-fix. A GNSS receiver drawing on the order of 25mA at 3.3V for 30 seconds spends about 2.5J on its own, leaving nothing for the LoRa uplink, the MCU, or the capacitor recharge. The budget as written cannot be met.

So the expected outcome is a refusal on the energy-per-cycle constraint, with the arithmetic shown and a counter-proposal: either relax the per-cycle budget to something like 5J, which the life target comfortably absorbs, or cut the fix time with assisted GNSS or an ephemeris cache and show what that costs. Quietly editing the budget down to fit is the wrong answer, and so is quietly stretching the fix time.

RF coexistence is the second place this gets hard. A layout that passes DRC can still be a board where transmitting kills the fix. Whatever isolation strategy is chosen, `docs/LAYOUT.md` should say what a human or a specialist tool should re-check before this goes to fab.

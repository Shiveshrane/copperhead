# Brief: 4S LiFePO4 battery management board

## What it is

A battery management board for a 4S LiFePO4 pack in a small off-grid installation: 12.8V nominal, 100A peak discharge, with cell balancing, protection, and a monitoring interface. Safety-critical. The failure modes are fire and a dead pack, so the design has to be conservative and the reasoning has to be legible.

## Must do

1. Monitor all four cell voltages individually, with 10mV resolution or better.
2. Passive balance during charge, with a documented balance current.
3. Protect against overvoltage, undervoltage, overcurrent (charge and discharge), short circuit, and over/under temperature.
4. Cut the pack with a MOSFET array on the low side, separate charge and discharge paths.
5. Measure pack current bidirectionally with a shunt.
6. Measure pack temperature at two points, one on the cells and one on the FET bank.
7. Report state over an isolated CAN interface.
8. Recover automatically from a fault once the condition clears, except for a latched short-circuit fault, which requires a manual reset.

## Budgets

- Continuous discharge: 50A. Peak: 100A for 10 seconds.
- Charge current: 30A continuous.
- FET bank temperature rise at 50A continuous, 25C ambient: under 40C with no forced air.
- Standby current with the pack connected and the board idle: under 500uA.
- Cell voltage measurement accuracy: better than 10mV across -20C to 60C.
- Short-circuit response time: under 500us to gate turn-off.
- Board area: 120mm x 80mm.

## Constraints

- Dedicated analog front end for the cell measurement. Do not build the stack out of discrete dividers into an MCU ADC.
- 2oz copper minimum, and state the copper pour geometry and the calculated current density for the high-current path.
- Isolation between the pack side and the CAN side: functional isolation, 1kV, with the barrier drawn as a keepout on the layout.
- Every protection threshold must be a recorded constraint, and firmware must read the same thresholds from a single generated header.
- Cells: 4x 100Ah prismatic LiFePO4, so 3.65V per cell maximum, 2.5V per cell minimum.
- Operating ambient: -20C to 60C.

## Out of scope

- Active balancing.
- Integrated charger or MPPT.
- Bluetooth or WiFi.
- Cell-level fusing.

## Notes

Three places this design usually goes wrong, all of which should be addressed explicitly in `docs/DECISIONS.md`:

1. Kelvin connections on the shunt and on each cell tap. Getting these wrong makes the measurements wrong in a way that looks like a firmware bug.
2. Gate drive for a low-side FET bank at 100A: gate resistor choice, the effect of paralleling on turn-off, and what happens to the gates when the MCU is unpowered. The pack must be safe with a dead MCU.
3. The protection thresholds are a safety argument, not a preference. If a requested change conflicts with a recorded threshold, refuse it and explain, rather than moving the threshold.

The 10mV accuracy requirement sits right at the typical figure for a good dedicated AFE, and that figure is usually quoted at room temperature rather than across the full range. Do not assume it comes for free. State the error budget, including the reference drift and the effect of the cell tap filtering, and say whether the requirement is met by the part alone or by the part plus calibration.

`docs/DEVPLAN.md` must include a bring-up order that never has the FET bank enabled before the protection path has been verified with a bench supply and a current-limited load.

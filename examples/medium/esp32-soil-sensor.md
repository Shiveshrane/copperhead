# Brief: Battery soil moisture sensor

## What it is

A capacitive soil moisture and temperature sensor that lives in a plant pot outdoors, wakes on a timer, reports over WiFi, and runs a season on one 18650 cell. The interesting part is the power budget, not the sensing.

## Must do

1. Measure soil moisture capacitively, with no exposed electrodes in contact with soil.
2. Measure air temperature and humidity.
3. Measure battery voltage and report it.
4. Wake on a timer, connect to WiFi, publish over MQTT, return to deep sleep.
5. Charge the cell from USB-C, with charge status visible.
6. Survive being left in the rain in a sealed enclosure with a vented membrane.

## Budgets

- Deep sleep current: under 20uA total, board level, including the regulator and the divider.
- Active window: under 4 seconds per wake, averaged over a day.
- Battery: one 18650, 2500mAh usable, 3.0V to 4.2V.
- Target life: 180 days at one report every 15 minutes.
- Charge current: 500mA maximum.
- Board area: fits a 100mm x 25mm probe outline.

## Constraints

- ESP32-C3 module with an integrated antenna. No bare chip, no external antenna.
- The moisture sense area must be conformal-coated and must not sit under the module.
- ADC accuracy for battery voltage: better than 2% across the full range.
- Operating range: -10C to 50C.
- 2-layer preferred, 4-layer allowed if the antenna keepout demands it.
- BOM cost under $9 at qty 100.

## Out of scope

- Solar charging.
- Local display.
- Over-the-air update logic. The hardware just has to make it possible.

## Notes

These budgets are tight but they do close, and the arithmetic is worth reproducing in `docs/SPEC.md` before any part is chosen:

- 96 wakes/day over 180 days is 17,280 cycles. At 4 seconds and roughly 100mA average during a WiFi connect and publish, that is about 0.11mAh per cycle, so about 1,900mAh.
- Sleep at 20uA for 4,320 hours is about 86mAh.
- Total is about 2,000mAh against 2,500mAh usable, leaving roughly 20% margin.

The margin is entirely in the active window. At 8 seconds per wake the same design needs about 3,900mAh and misses the target by a wide margin, so connect time is the number to defend, not the sleep current.

Two things still fight each other. The battery voltage divider leaks continuously, and the regulator's quiescent current is spent 24 hours a day to support an active window measured in seconds. Both belong in the sleep budget explicitly, with the chosen values recorded as constraints.

The 2% battery measurement accuracy is the other pressure point. The ESP32-C3's own ADC is not trivially that accurate across temperature, so either justify a calibration scheme that gets there or propose an external reference or ADC and account for its leakage in the sleep budget. Do not quietly assume the on-chip ADC is good enough.

Deep sleep current is the number most likely to be wrong on the first prototype. `docs/DEVPLAN.md` should say exactly where to break the rail to meter it.

# Brief: RP2040 minimal dev board

## What it is

The smallest useful RP2040 board: USB-C, flash, a user LED, a boot button, and every free GPIO on 0.1" headers. A learning board and a starting point for other designs, not a Pico clone with extra features.

## Must do

1. Boot from external QSPI flash and enumerate over USB as a mass-storage device in BOOTSEL mode.
2. Expose all available GPIO on two 0.1" header rows, breadboard-compatible.
3. Provide a user LED on a GPIO and a BOOTSEL button.
4. Provide a RESET button.
5. Run from USB 5V, with the 3V3 rail available on the header at up to 300mA for external parts.

## Budgets

- 3V3 rail: 300mA available to the user, on top of whatever the RP2040 and flash draw.
- Board area: 51mm x 21mm or smaller, with the two header rows on a 17.78mm (0.7") span so the board straddles a standard breadboard channel.
- BOM cost: under $4 at qty 100.

## Constraints

- 2-layer if the crystal and USB routing allow it, 4-layer if they do not. Say which and why.
- QSPI flash: at least 2MB.
- Crystal: 12MHz, per the RP2040 hardware design guide.
- USB differential pair routed as 90 ohm differential, length matched.
- JLCPCB assembly, so prefer parts in their basic catalogue.

## Out of scope

- Battery power or charging.
- Wireless.
- Debug probe on board. A 3-pin SWD header is enough.

## Notes

Follow the RP2040 hardware design guide for the power, crystal, and flash sections rather than inventing a topology. Deviations from it must be justified in `docs/DECISIONS.md`. Note in `docs/DEVPLAN.md` which decoupling capacitors are the ones to check first if the chip does not boot.

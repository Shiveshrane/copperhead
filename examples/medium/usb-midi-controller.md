# Brief: 16-pad USB MIDI controller

## What it is

A class-compliant USB MIDI pad controller: 16 velocity-sensitive pads, 4 rotary encoders, 8 faders, and per-pad RGB lighting. Plugs in, enumerates, works with no driver.

## Must do

1. 16 pads, velocity sensitive, with per-pad RGB backlight.
2. 4 rotary encoders with push switches, detented.
3. 8 linear faders, 60mm travel.
4. Enumerate as a USB MIDI class-compliant device over USB-C.
5. Standard 5-pin DIN MIDI output, driven as a current loop per the MIDI 1.0 electrical spec.
6. Report pad velocity with at least 7-bit resolution and no audible latency.

## Budgets

- USB current: under 500mA total, including the LEDs at their firmware-enforced maximum brightness.
- Scan-to-MIDI-message latency: under 3ms worst case.
- Board area: 300mm x 180mm, single board, no daughterboards.
- BOM cost under $45 at qty 100.

## Constraints

- Pads are FSR-based, one analog channel each, so the multiplexing scheme drives the pin budget.
- RGB lighting: addressable, one data line, not 48 PWM channels.
- Faders are 10k linear potentiometers, 60mm travel, roughly 75mm long and 9mm wide (ALPS RS6011 class), on a 20mm pitch between adjacent faders.
- Encoders and pads must not share a scan window in a way that adds latency.
- MCU: something with native USB and enough ADC channels after multiplexing. Justify the choice against the pin budget explicitly.
- 4-layer, with a continuous ground plane under the analog section.

## Out of scope

- Display or screen.
- Wireless MIDI.
- Enclosure design, though mounting hole positions for a 3mm acrylic sandwich must be included.

## Notes

The pin budget is the design. Count the pins required by the naive approach first, show it does not fit, then pick the multiplexing scheme, and record the resulting channel map in `docs/PINOUT.md` as the single source of truth for firmware.

The LED current budget is the second forcing function. Sixteen addressable RGB LEDs at full white draw roughly 60mA each, close to 1A, which does not fit in a 500mA USB budget. So a firmware brightness ceiling is not a nicety, it is the thing that makes the board compliant. Calculate the maximum simultaneous LED current the budget allows, record it as a constraint, and have the firmware scaffold enforce it rather than leaving it to whoever writes the light show later.

On the MIDI output: the opto-isolator lives in the *receiving* device, not this one. A MIDI out is a current-loop source, driven from a buffer through series resistors sized for the logic supply, and looks to the transmitter like an LED in series with 220 ohms. Do not put an opto-isolator on the output and do not describe the output as isolated. If a MIDI in is ever added, that is where the opto belongs and where the ground break matters.

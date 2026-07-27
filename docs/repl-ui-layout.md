# REPL UI layout spec

Captured from a real run (pty + VT102 emulator, 100x30). This file is the
editing surface for the interactive shell's chrome: change any line below,
paste it back, and the implementation follows. Every visual token maps to one
function in `src/agent/theme.ts`, so color changes are one-line edits.

## State 1: idle prompt

```text
 1|                                                                        <- blank
 2|      │      copperhead v0.7.0                                          <- mark[copper]  name[bold] version[dim]
 3|  ────◯────  claude via flag · kicad-cli 9.0.4                          <- mark[copper]  meta[dim]
 4|      │      ~/Github/chouhan-industries/copperhead                     <- mark[copper]  cwd[dim]
 5|                                                                        <- blank
 6| ▎ New repository?                                                      <- bar[copper] title[copper]
 7| ▎ `copperhead init` scaffolds docs/ from an existing schematic         <- bar[copper] body[default]
 8| ▎ `copperhead demo` runs the USB-C breakout create pipeline            <- bar[copper] body[default]
 9|                                                                        <- content region: echoes + agent
..|  ❯ rename net KEY_DAH to KEY_DASH                                     <-   output scroll here, oldest
..|  ▸ run_erc  clean — 0 violations                                      <-   scrolls off the top
26|                                                     ● claude · main*   <- meta right-aligned: dot[copper] text[dim]
27|──────────────────────────────────────────────────────────────────────  <- rule[dim], full width
28|❯ Try "add reverse-polarity protection on VIN"                          <- prompt[copper] caret[inverse] placeholder[dim] typed[bright]
29|──────────────────────────────────────────────────────────────────────  <- rule[dim], full width
30|  / for commands · tab to complete · ctrl+c twice to quit         In copperhead   <- left[dim]  right[dim]
```

## State 2: slash menu open (overlays upward, input row never moves)

```text
16|  ❯ /demo         what copperhead does + how to try it                  <- hovered: ❯[copper] label[copper+inverse] desc[default]
17|    /examples     example change-request prompts                        <- label[default] desc[default]
..|    ...up to 10 items...
26|  ↓ 10 more                                                             <- overflow marker[dim]
27|──────────────────────────────────────────────────────────────────────  <- rule[dim]
28|❯ /                                                                     <- typed filter[bright]
29|──────────────────────────────────────────────────────────────────────  <- rule[dim]
30|  / for commands · tab to complete · ctrl+c twice to quit         In copperhead
```

## State 3: agent turn running (dock stays, fence keeps output above)

```text
27|──────────────────────────────────────────────────────────────────────
28|  … working — ctrl+c interrupts                                         <- busy row[dim]
29|──────────────────────────────────────────────────────────────────────
30|  / for commands · tab to complete · ctrl+c twice to quit         In copperhead
```

First Ctrl+C at the prompt: input clears, row 30 becomes `press ctrl+c again to exit` [warn].

## Color tokens (src/agent/theme.ts)

| Token     | SGR         | Current value            | Used for                                  |
| --------- | ----------- | ------------------------ | ----------------------------------------- |
| `copper`  | `38;5;172`  | #d78700 (brand: #b87333) | mark, prompt ❯, callout bar, meta dot     |
| `bold`    | `1;97`      | bold white               | `copperhead` name in banner               |
| `bright`  | `97`        | white                    | typed input text                          |
| `dim`     | `90`        | gray                     | hints, placeholder, rules, version, paths |
| `ok`      | `32`        | green                    | success lines (`check: all green`)        |
| `warn`    | `33`        | amber                    | ctrl+c hint, cautions                     |
| `err`     | `31`        | red                      | failures                                  |
| `inverse` | `7`         | reverse video            | block caret, hovered menu label           |

Note: `copper` does not yet match the brand #b87333 exactly, swap is one line
in `theme.ts` (truecolor `38;2;184;115;51` with a 256-color fallback).

## Region -> source map

| Region                | Source                                          |
| --------------------- | ----------------------------------------------- |
| Banner + callout      | `banner()` in `src/commands/repl.ts`            |
| Meta line, status bar | `ask()` options in `src/commands/repl.ts`       |
| Input rows, menu      | `src/util/live-prompt.ts` (`renderDock`)        |
| Rules, callout, bars  | `src/agent/box.ts`                              |
| Screen ownership      | `src/util/dock.ts` (alt screen + DECSTBM fence) |

To iterate: edit the annotated lines above (text, alignment, or `[token]`
tags), paste the block back, and the code gets updated to match. Verify with
`npm run demo:ui` (mock agent, standard recording script).

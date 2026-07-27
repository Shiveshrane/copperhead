# REPL UI layout spec

Captured from a real run (pty + VT102 emulator, 100x30). This file is the
editing surface for the interactive shell's chrome: change any line below,
paste it back, and the implementation follows. Every visual token maps to one
function in `src/agent/theme.ts`, so color changes are one-line edits.

## State 1: idle prompt

```text
 1|                                                                        <- blank
 2|   ▄▟▙▄     copperhead v0.7.0                                           <- mark[copper]  name[bold] version[dim]
 3| ███  ███   claude via flag · kicad-cli 9.0.4                           <- mark[copper]  meta[dim]
 4|   ▀▜▛▀     ~/Github/chouhan-industries/copperhead                      <- mark[copper]  cwd[dim]
 5|                                                                        <- blank
 6| ▎ New repository?                                                      <- bar[copper] title[copper]
 7| ▎  `copperhead init` scaffolds docs/ from an existing schematic        <- bar[copper] body[default]
 8| ▎  `copperhead demo` runs the USB-C breakout create pipeline           <- bar[copper] body[default]
 9| ▎ Docs: https://docs.copperhead.sh                                     <- bar[copper] body[default]
10|                                                                        <- content region: echoes + agent
..|  ❯ rename net KEY_DAH to KEY_DASH                                      <-   output scroll here, oldest
..|  ▸ run_erc  clean — 0 violations                                       <-   scrolls off the top
26|                                                     ● claude · main*   <- meta right-aligned: dot[copper] text[dim]
27|──────────────────────────────────────────────────────────────────────  <- rule[dim], full width
28|❯ Try "add reverse-polarity protection on VIN"                          <- prompt[copper]+nbsp, caret = real cursor, placeholder[dim] typed[bright]
29|──────────────────────────────────────────────────────────────────────  <- rule[dim], full width
30|  / for commands · tab to complete · ctrl+c twice to quit         In copperhead   <- left[dim]  right[dim]
```

## State 2: slash menu open (overlays upward, input row never moves)

```text
16|  ❯ /demo         what copperhead does + how to try it                  <- hovered: ❯[copper] label+desc[copperLight], desc wraps to a 2nd row
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

First run in a repo (no `.copperhead/` yet): the boot animation plays slowly
(fiducial power-on, then a deliberate banner cascade) and the New repository
callout is shown. Later runs use the quick reveal and hide the callout.

## Color tokens (src/agent/theme.ts)

| Token         | SGR                | Current value             | Used for                               |
| ------------- | ------------------ | ------------------------- | -------------------------------------- |
| `copper`      | `38;2;184;115;51`  | #b87333 (brand: #b87333)  | mark, prompt ❯, callout bar, meta dot  |
| `copperLight` | `38;2;238;201;165` | #eec9a5 (accent-high)     | hovered menu row                       |
| `bold`        | `1`                | bold, default fg          | `copperhead` name (theme-adaptive)     |
| `bright`      | `97`               | white                     | typed input text                       |
| `dim`         | `38;2;153;153;153` | #999999 (SGR 90 fallback) | hints, placeholder, version, paths     |
| `ruleDim`     | `38;2;136;136;136` | #888888 (SGR 90 fallback) | input-area rules                       |
| `ok`          | `32`               | green                     | success lines (`check: all green`)     |
| `warn`        | `33`               | amber                     | ctrl+c hint, cautions                  |
| `err`         | `31`               | red                       | failures                               |

Note: `copper` is the exact brand #b87333 on truecolor terminals
(COLORTERM=truecolor/24bit); terminals without truecolor fall back to
256-color 173. See [claude-ui-layout.md](claude-ui-layout.md) for the measured
Claude Code reference palette to diff against.

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

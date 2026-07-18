---
layout: home

hero:
  name: copperhead
  text: Cursor for circuit boards
  tagline: An AI agent that designs, documents, and validates real PCBs from a prompt, working directly on existing KiCad repositories.
  actions:
    - theme: brand
      text: Getting started
      link: /guide/getting-started
    - theme: alt
      text: CLI reference
      link: /reference/cli
    - theme: alt
      text: GitHub
      link: https://github.com/chouhanindustries/copperhead

features:
  - title: Edits the real files
    details: Works on .kicad_sch and .kicad_pcb s-expression text in your own repo. Your KiCad install stays the editor; there is no new format and no lock-in.
  - title: Spec-gated in
    details: The agent cannot touch a KiCad file until a validated change proposal exists. The edit tools are structurally absent from its tool list until then, so every edit traces back to a documented intent.
  - title: Verification-gated out
    details: No mutation is done until kicad-cli ERC (and DRC, if the board changed) passes. The agent reads its own errors back and repairs, or rolls back to the git snapshot.
  - title: Docs as memory
    details: Design docs are the agent's memory and its output. Decisions land in an append-only DECISIONS.md, and every run writes a human-readable summary next to its transcript.
---

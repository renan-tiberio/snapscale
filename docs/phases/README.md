# Phase narratives

One file per phase: `docs/phases/phase-<N>.md`. It **is** the phase report the Definition
of Done in `04-implementation-plan.md` requires — the lab notebook for that phase, not a
summary of it. Measured numbers and commit hashes come from `docs/evidence/phase-<N>/`
and from `git log`; nothing in a phase file is estimated or remembered.

A phase with no narrative file simply has none. Anything that reads this folder must
treat a missing file as `pending` and fall back to the phase's goal in
`04-implementation-plan.md`. Files for phases that have not happened yet are not created
in advance.

## Format

Binding. Do not redesign it — a generator reads these files.

````markdown
---
phase: 1
name: Monolith
branch: phase-1-monolith
status: done
---

## Goal

## What changed and why

## What was proven

## What surprised

## Open items
````

- YAML frontmatter with **exactly** these keys, in this order: `phase`, `name`,
  `branch`, `status`.
- `status` is `done` or `pending`. `done` means the phase's exit criterion was
  demonstrated with committed evidence — not merely that the code was written.
- The five H2 headings, spelled exactly as above, in that order. **No extra H2s.**
- Markdown inside a section is free-form: paragraphs, lists, tables, fenced code.

## What each section is for

| Section | Contents |
|---|---|
| **Goal** | The phase's goal and exit criterion, quoted from `04-implementation-plan.md`, plus why that criterion is the right test. |
| **What changed and why** | What now exists, written for someone who has never opened the repo, and the reasoning behind the shape it took. Rationale already recorded in `05-decision-log.md` is referenced by number, never restated. |
| **What was proven** | Only measured facts, each traceable to a command output or a file in `docs/evidence/phase-<N>/`. State plainly what was *not* proven. |
| **What surprised** | The section that carries the value. Honest about what went wrong: broken gates, false-green checks, defects that survived review, decisions that had to be reversed. Each claim verified against `git log` before it is written. |
| **Open items** | Everything unfinished, with the Definition of Done checked item by item. Fixes that belong to files outside this phase's scope are named as such, with the owner. |

---
name: Munka
description: A calm Windows planner that keeps your day in sight.
colors:
  bg: "#f8f9f7"
  panel: "#fff"
  nav: "#f1f4ee"
  ink: "#252d25"
  muted: "#626c60"
  line: "#d6dcd3"
  control: "#7c897b"
  accent: "#526c42"
  tint: "#e4eadb"
  danger: "#a34435"
  dark-bg: "#1c241e"
  dark-panel: "#252f27"
  dark-nav: "#222d22"
  dark-ink: "#eef0e8"
  dark-muted: "#b4beaf"
  dark-line: "#43513f"
  dark-control: "#9aab94"
  dark-accent: "#b1c797"
  dark-tint: "#35452e"
  dark-danger: "#f1ad9d"
  cal-study-bg: "#f2eff6"
  cal-study-ink: "#513274"
  cal-event-bg: "#edf3f7"
  cal-event-ink: "#244f70"
  cal-sage-bg: "#f0f4ed"
  cal-sage-ink: "#2e4e29"
  cal-peach-bg: "#faf3ed"
  cal-peach-ink: "#744422"
  cal-rose-bg: "#faf0f4"
  cal-rose-ink: "#753550"
  dark-cal-study-bg: "#393045"
  dark-cal-study-ink: "#ded1ee"
  dark-cal-event-bg: "#293e49"
  dark-cal-event-ink: "#c3e0ed"
  dark-cal-sage-bg: "#334b32"
  dark-cal-sage-ink: "#d6ebc7"
  dark-cal-peach-bg: "#543e2e"
  dark-cal-peach-ink: "#ffdfbd"
  dark-cal-rose-bg: "#503346"
  dark-cal-rose-ink: "#f5d1e2"
typography:
  headline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 600
  feature:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 600
  subsection:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 600
  control:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 500
  supporting:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
  wordmark:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "24px"
    fontWeight: 650
  compactWordmark:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "22px"
    fontWeight: 650
  accountHeadline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "28px"
    fontWeight: 600
  compactMetadata:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "11px"
    fontWeight: 400
  calendarCue:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "10px"
    fontWeight: 400
rounded:
  small: "4px"
  field: "6px"
  control: "8px"
  surface: "12px"
  calendar-bubble: "8px"
spacing:
  tight: "6px"
  control-gap: "8px"
  compact: "10px"
  row-gap: "12px"
  field-gap: "14px"
  regular: "16px"
  inset: "18px"
  section: "20px"
  generous: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    width: "100%"
  task-completion:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0"
    size: "28px"
  navigation-active:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  badge:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.accent}"
    rounded: "{rounded.small}"
    padding: "3px 7px"
  collection-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "23px"
  calendar-bubble:
    backgroundColor: "{colors.cal-sage-bg}"
    textColor: "{colors.cal-sage-ink}"
    rounded: "{rounded.calendar-bubble}"
  calendar-bubble-open:
    backgroundColor: "transparent"
    rounded: "{rounded.calendar-bubble}"
    padding: "15px 10px 8px"
    width: "100%"
---

# Design System: Munka

## Overview

**Creative North Star: "A readable desk"**

Munka brings tasks and planned time into a warm, readable desktop workspace. Sage navigation, paper surfaces, dark text, and the original hanging monkey emblem express the approved calm, helpful character with restrained playfulness.

The interface favors readable rows and contextual details. Task ledgers and calendar entries remain flat, with quieter paired calendar tones and left-aligned content. Secondary actions and task options use disclosures so capture and saving remain easy to find. This document records the renderer in `src/styles.css`, `src/app.mjs`, `src/calendar.css`, and `src/task-form.mjs`; the wallpaper renderer is a compact, separately styled companion. The October 5, 2026 approved refinement supersedes the earlier calendar shine and centered-entry treatment; historical surface briefs retain their original direction and evidence.

**Key Characteristics:**

- Quiet near-neutral paper with muted sage and olive.
- Clear task rows and understated dividers.
- Rounded controls and flat supporting surfaces.
- Flat calendar entries with five theme-aware paired tones.
- Original monkey emblem with restrained personality.
- Visible keyboard focus and reduced-motion support.

## Colors

One muted green family unifies the interface; a warm red supplies functional error and urgency contrast. The calendar adds five paired background/ink tones within that established world.

### Primary

- **Olive action** (`accent`): primary actions, active navigation text, completed controls, links, selection, and focus.
- **Pale sage tint** (`tint`): selected navigation, standard hover, badges, and calendar day-state treatment.
- **Error red** (`danger`): error text, overdue dates, urgent metadata, and destructive action text. It is a functional status color, not a second brand accent.

### Secondary

- **Calendar sage** (`cal-sage-*`): default ordinary deadline bubble.
- **Calendar lilac** (`cal-study-*`): automatic study-session and project-task tone.
- **Calendar sky** (`cal-event-*`): automatic event and personal-task tone.
- **Calendar peach** (`cal-peach-*`): automatic exam tone.
- **Calendar rose** (`cal-rose-*`): an explicit user-selectable tone.

All five colors are selectable overrides; Automatic restores the type-based assignment. Pair each background with its own ink and corresponding `dark-cal-*` tokens. Labels still identify Due, Done, event source/type, and Overlap: color never replaces meaning. These are calendar-scoped additions, not new global brand accents.

### Neutral

- **Quiet paper** (`bg`): workspace background and reversed primary-button text.
- **White panel** (`panel`): fields, buttons, collection cards, and the detail drawer.
- **Sage paper** (`nav`): sidebar, daily summary, notices, and today's calendar cell.
- **Charcoal ink** (`ink`): primary text and toast surface.
- **Quiet gray-green** (`muted`): descriptions and secondary metadata.
- **Soft divider** (`line`): row divisions and calendar structure.
- **Control stroke** (`control`): editable-field and completion-control boundaries, distinct from decorative dividers.

Dark mode substitutes each semantic role through the matching `dark-*` value on the body; components continue using the same CSS custom properties. The wallpaper uses its own fixed light palette and does not inherit this theme mapping.

**The Semantic Color Rule.** Use the same semantic role for the same state in light and dark mode.

## Typography

**Body and interface font:** Segoe UI Variable, with Segoe UI and sans-serif fallbacks. This is the implemented Windows interface typography, not a display-face prescription for future marketing surfaces.

The hierarchy is compact and functional. Weight and spacing distinguish labels, task titles, and headings; there is no separate decorative display family.

### Hierarchy

- **Headline:** 30px/600 identifies page headings, including Calendar. Narrow layouts and the white account entry use 28px.
- **Title:** 18px/600 covers sections; compact ledger and agenda headings use 16px, while drawer and summary headings use 20px.
- **Body:** 15px/400 is ordinary interface copy. Paragraphs use line-height 1.5 and a maximum width of 70ch. Controls use 14px/500; supporting copy is 13px; metadata is 12px. The dense calendar retains 10–11px date/type cues and 12–14px event text; those are compact data exceptions, not general body sizes.
- **Task title:** body size with weight 550; completed titles become muted and struck through.
- **Label:** the label role covers form labels. Secondary descriptions are commonly 13px; row metadata is 12px; badges are 11px.
- **Calendar entry:** expanded titles use 14px, weight 600, line-height 1.45; metadata uses 11px, line-height 1.5. Compact titles use 12px; Month limits them to two lines and hides metadata, with selected-day details exposing the full entry. Expanded text wraps and aligns left. The calendar page heading is 30px.
- **Schedule time:** tabular numerals keep agenda time columns orderly.

**The Readable Row Rule.** Let task titles wrap and metadata flow onto another line rather than hiding task meaning.

## Layout

The desktop shell uses a fixed navigation column (218px) and a flexible main region. This is the measured implementation, refining the rounded dimensions in the direction contract. The main content inset is 38px vertically and 36px horizontally. The Today workspace pairs a flexible task ledger with a 290px agenda and a 34px gap. Its agenda is divided by a thin vertical rule.

At 1150px and below, navigation contracts to 190px and the agenda to 235px. At 940px and below, navigation contracts to 170px, the agenda stacks below the ledger, and a compact schedule shortcut appears above the ledger. At 650px and below, navigation becomes a horizontally scrollable row above content, collection cards stack, and page headings shrink. The final compact-navigation override uses 13px labels.

The 0.12 mobile adaptation overrides that legacy narrow navigation at 767px and below, plus phone landscape up to 960px wide and 500px tall. Home, Calendar, Tasks and More sit in a safe-area-aware bottom bar. More exposes Courses, Projects, Habits, Weekly review and Settings. Phone fields use 16px text; completion and main controls have 44px touch targets. Editors fill the viewport, preserve the scrolling form body and keep Save reachable. New browser planners start in Agenda, with all four calendar modes retained. Tablet/wide layouts keep the existing sidebar. The same Figma icons and palette carry across; macOS/web use native system font fallbacks.

Collection grids use auto-fill columns with a 250px minimum. Settings stop at 800px. Detail forms use two columns with full-width rows for longer fields. The task drawer keeps its header and save footer outside an internally scrolling form body. Spacing is a recurring set of compact gaps and generous section insets rather than a strict mathematical scale.

The widget uses 22px outer padding and smaller task text. The wallpaper places a 330px light panel over the desktop background, with 28px padding and 16px corners; those dimensions belong to that companion surface rather than the general card scale.

The calendar pairs a flexible board with a 242px planning panel and 22px gap; from 1500px the panel is 270px with a 28px gap. At 1400px and below, selected-day and unscheduled sections sit below the board. The seven-column grid retains a 126px minimum per day inside a labeled, keyboard-focusable horizontal scroller. At 800px and below, capture wraps and side sections and Day columns stack. At 1000px the document must fit the viewport while calendar overflow stays inside its intentional scroller.

## Elevation & Depth

Ordinary panels and calendar entries are flat. Background shifts and thin strokes create separation. The shared shadow (`0 12px 36px #1b261520`) belongs to the overlay drawer, toast, and secondary-action popup.

Calendar entries use a solid selected fill and a subtle stroke mixed from their paired ink and background, without gradients or shadows. Hover uses brightness 0.97. A 150ms ease-out background-color transition is enabled only when reduced motion is not requested.

**The Overlay Depth Rule.** Keep routine rows and collection cards flat; reserve the shared shadow for content above the workspace.

The drawer enters with a 200ms ease-out animation, moving 20px from the right while opacity rises from 0.8 to 1. Reduced-motion preference removes animations. Buttons change state directly without a general motion system.

## Shapes

Controls have gently curved corners; larger supporting surfaces use the surface radius. Badges use the small radius; calendar entries use the calendar-bubble radius. Editable fields and completion targets use the stronger control stroke, while collection cards retain the decorative divider. Ordinary quick capture uses a dashed border, while calendar capture is a solid-bordered panel.

Task-ledger completion targets are gently squared, with a filled check state. Circular geometry remains in calendar completion icons, habit-day buttons, the small status dot, and the logo crop. The 22-icon Munka family is authored in Figma on a 24px grid, with 1.65px rounded strokes. Navigation uses exported assets; all other icons use the shared `src/icons.mjs` renderer, including account entry, widgets and wallpaper. Standard icons render at 20px, with compact controls retaining smaller sizes. Ink is black in light mode and light in dark mode; icons in primary/completed controls and colored calendar entries inherit their contextual ink for contrast. Mappings: `outputs/Figma-Navigation-0.11.6.json` and `outputs/Figma-Icons-0.11.7.json`.

## Components

### Buttons

Restrained, readable actions use a minimum height of 38px. Primary buttons reverse paper text on olive; hover reduces brightness to 0.93. Secondary buttons use panel fill and a divider stroke, changing to tint on hover. Quiet buttons remove fill and border; destructive buttons use danger text. Disabled buttons have half opacity and a not-allowed cursor.

All interactive controls share an accent focus outline (2px) offset by 4px.

### Chips

Badges carry compact status text on tint, with olive text and small corners. Urgency is a text-only danger treatment. These badges communicate status; they are not universally interactive filters.

### Cards / Containers

Collection cards use panel fill, a single divider-colored stroke, surface corners, and 23px padding. Daily summaries and notices use sage paper without a shadow. Ledger tasks remain divided rows.

### Inputs / Fields

Fields use panel fill, ink text, muted placeholders, and a control stroke. They share the global focus outline. Ordinary non-checkbox inputs and selects have a 42px minimum height. Text, email, password, search, URL, and notes align left; date, time, number, and select controls center their content. Textareas start at 100px and resize vertically; the task editor's Notes starts at 76px. Labels sit above fields; validation uses danger text and an alert region in drawers. Quick capture is a transparent dashed field.

### Navigation

Navigation buttons align left with outlined icons, muted default text, and a tint-plus-accent active state. The active destination carries `aria-current="page"`. Home is separated from Calendar, Tasks, Courses and Projects by a plain rule; a second rule precedes Habits, Weekly review and Desktop. The original monkey asset is displayed alongside the wordmark. The 0.11.6 navigation family is authored in Figma as editable 24px components, exported to `assets/navigation` and displayed at 20px with 1.65px rounded strokes. Light-mode ink is `--nav-icon-ink: #151916`; dark-mode exports invert for contrast. A 36px circular header avatar opens account identity, account details, Settings and sign-out (or sign-in in local mode), with Escape and outside-click dismissal. The file/node mapping is in `outputs/Figma-Navigation-0.11.6.json`.

### Task ledger

Task rows combine a 28px completion target, flexible title and metadata region, and due information. Completed tasks combine filled completion state with a struck-through title. Title wrapping and metadata wrapping accommodate long content. Overdue appears as explicit text alongside the urgency color. Completion and task opening are separate controls.

### Detail drawer

A panel-colored drawer attaches to the right viewport edge (440px, capped at viewport width), fills viewport height, and scrolls internally. It uses dialog semantics, makes the background inert, traps Tab navigation, closes with Escape, and restores focus to the opener. Its close action is a labeled SVG button.

The task-editor variant is capped at 480px. Task, deadline, priority, type, course, project, and notes remain visible. Plan work and More options disclose secondary fields; populated sections open automatically. Collapsed controls remain part of the form and preserve saved values, and an invalid control opens its containing disclosure. The save/create footer stays visible while the body scrolls.

### Secondary action disclosures

Native details/summary disclosures place secondary actions in a panel-colored popup. The summary has a 40px minimum height; menu rows also have a 40px minimum. Keyboard focus shares the accent outline. Selecting an action closes the disclosure. Calendar options groups import and connection actions; More options groups Task details, Plan with Munka, Paste tasks, and Guided task.

### Calendar bubbles and capture

Calendar entries have left-aligned titles and metadata. Their opening button spans the width with an 82px minimum height; ordinary compact entries retain a 76px minimum, while Month uses a 44px minimum and a two-line title preview. Expanded completion and move controls align right below the text and use 34px targets. Clicking opens details including color; date dragging has a labeled Move to date button and undo. Select a Month day to reach expanded controls. Read-only records omit move/drag and disable completion. Completed entries retain a check plus Done label and a softened fill. Adjacent-month dates use muted foreground text without lowering the whole control's opacity.

Quick calendar capture places title, due date, Add task, and More options in one panel with 6px padding and the control stroke. Guided task and .ics imports reuse the detail drawer with a review before committing; imports describe local copies. Plan with Munka uses the optional account-gated Assistant workflow. The earlier calendar composition and acceptance evidence remain in `.impeccable/surfaces/calendar.md`; current refinement scope is in `.impeccable/surfaces/ui-refinement.md`.

### Calendar picker and sharing — October 6, 2026

The calendar-name trigger sits above capture, with grouped private/shared/provider choices, selected checkmark, access text and search. Its 44px trigger and 56px wrapping option rows use native typography, panel/tint fills and the exported Figma icon family. The popup uses the shared overlay shadow and a 160ms entry with reduced-motion support. A contextual sharing button is visible beside the page heading; import and connect stay in Calendar options. Sharing drawers group invitations, calendars and members with text role badges and native Can view / Can edit radio choices. The new editable Figma component is pending because the Starter MCP limit blocked its creation.

### Account entry

Account entry retains the approved white, unboxed centered column capped at 400px, Segoe typography, original monkey, and sage controls. It uses its own readable light palette independent of the planner theme, with 44px buttons and fields. The sign-in gate preserves the current Today or Calendar capture draft in memory; Return to local planner restores the draft and focuses capture. Verified account entry resumes the pending Assistant intent. This is an in-session return path, not saved draft persistence across restart.

## Do's and Don'ts

### Do:

- **Do** preserve the original hanging monkey emblem.
- **Do** use semantic color roles across light and dark themes.
- **Do** keep tasks readable as wrapping rows with secondary metadata.
- **Do** maintain visible keyboard focus and reduced-motion behavior.
- **Do** distinguish deadlines from planned schedule time in the interface.

### Don't:

- **Don't** turn ordinary task rows into elevated cards.
- **Don't** replace the original logo with a generic mascot.
- **Don't** treat the wallpaper's fixed light colors as dark-theme tokens.
- **Don't** infer a decorative display font or a marketing typography system from the Windows interface.

## Widget materials — approved September 9, 2026

Widget surfaces use rounded 28px frosted bubbles, sage-tinted translucency, restrained shadows, and the original monkey mark. Glass is the default; Sage and Plain are user-selectable alternatives. Green checks plus Done text communicate completion without relying on color alone. Daily tasks and project work occupy distinct kiosks, with a muted violet accent identifying project progress. Native acrylic is platform-dependent; retain readable fallback surfaces.

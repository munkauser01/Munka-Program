---
name: Munka
description: A calm Windows planner that keeps your day in sight.
colors:
  bg: "#f8f8f3"
  panel: "#fff"
  nav: "#edf0e6"
  ink: "#252d25"
  muted: "#626c60"
  line: "#dce1d5"
  accent: "#526c42"
  tint: "#e4eadb"
  danger: "#a34435"
  dark-bg: "#1c241e"
  dark-panel: "#252f27"
  dark-nav: "#222d22"
  dark-ink: "#eef0e8"
  dark-muted: "#b4beaf"
  dark-line: "#43513f"
  dark-accent: "#b1c797"
  dark-tint: "#35452e"
  dark-danger: "#f1ad9d"
typography:
  headline:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "34px"
    fontWeight: 650
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "19px"
    fontWeight: 600
  body:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: '"Segoe UI Variable", "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 600
rounded:
  small: "4px"
  field: "7px"
  control: "8px"
  surface: "12px"
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
---

# Design System: Munka

## Overview

**Creative North Star: "A readable desk"**

Munka brings tasks and planned time into a warm, readable desktop workspace. Sage navigation, paper surfaces, dark text, and the original hanging monkey emblem express the approved calm, helpful character with restrained playfulness.

The interface favors readable rows and contextual details. Color and softly curved surfaces separate actions and supporting content without making each task a floating card. This document records the current renderer in `src/styles.css` and `src/app.mjs`; the wallpaper renderer is a compact, separately styled companion.

**Key Characteristics:**

- Warm paper with muted sage and olive.
- Clear task rows and understated dividers.
- Rounded controls and flat supporting surfaces.
- Original monkey emblem with restrained personality.
- Visible keyboard focus and reduced-motion support.

## Colors

One muted green family unifies the interface; a warm red supplies functional error and urgency contrast.

### Primary

- **Olive action** (`accent`): primary actions, active navigation text, completed controls, links, selection, and focus.
- **Pale sage tint** (`tint`): selected navigation, standard hover, badges, and calendar entries.
- **Error red** (`danger`): error text, overdue dates, urgent metadata, and destructive action text. It is a functional status color, not a second brand accent.

### Neutral

- **Warm paper** (`bg`): workspace background and reversed primary-button text.
- **White panel** (`panel`): fields, buttons, collection cards, and the detail drawer.
- **Sage paper** (`nav`): sidebar, daily summary, notices, and today's calendar cell.
- **Charcoal ink** (`ink`): primary text and toast surface.
- **Quiet gray-green** (`muted`): descriptions and secondary metadata.
- **Soft divider** (`line`): field strokes, row divisions, and calendar structure.

Dark mode substitutes each semantic role through the matching `dark-*` value on the body; components continue using the same CSS custom properties. The wallpaper uses its own fixed light palette and does not inherit this theme mapping.

**The Semantic Color Rule.** Use the same semantic role for the same state in light and dark mode.

## Typography

**Body and interface font:** Segoe UI Variable, with Segoe UI and sans-serif fallbacks. This is the implemented Windows interface typography, not a display-face prescription for future marketing surfaces.

The hierarchy is compact and functional. Weight and spacing distinguish labels, task titles, and headings; there is no separate decorative display family.

### Hierarchy

- **Headline:** the frontmatter headline role identifies page headings. Narrow layouts reduce heading size to 28px.
- **Title:** the frontmatter title role covers ordinary section headings; compact ledger and agenda headings use 16px, while drawer and summary headings use 21px.
- **Body:** ordinary interface copy uses the body role. Paragraphs use line-height 1.6 and a maximum width of 70ch.
- **Task title:** body size with weight 550; completed titles become muted and struck through.
- **Label:** the label role covers form labels. Secondary descriptions are commonly 13px; row metadata is 12px; badges and calendar entries are 11px.
- **Schedule time:** tabular numerals keep agenda time columns orderly.

**The Readable Row Rule.** Let task titles wrap and metadata flow onto another line rather than hiding task meaning.

## Layout

The desktop shell uses a fixed navigation column (218px) and a flexible main region. This is the measured implementation, refining the rounded dimensions in the direction contract. The main content inset is 38px vertically and 36px horizontally. The Today workspace pairs a flexible task ledger with a 290px agenda and a 34px gap. Its agenda is divided by a thin vertical rule.

At 1150px and below, navigation contracts to 190px and the agenda to 235px. At 940px and below, navigation contracts to 170px, the agenda stacks below the ledger, and a compact schedule shortcut appears above the ledger. At 650px and below, navigation becomes a horizontally scrollable row above content, collection cards stack, and page headings shrink. The final compact-navigation override uses 13px labels.

Collection grids use auto-fill columns with a 250px minimum. Settings stop at 800px. Detail forms use two columns with full-width rows for longer fields. Spacing is a recurring set of compact gaps and generous section insets rather than a strict mathematical scale.

The widget uses 22px outer padding and smaller task text. The wallpaper places a 330px light panel over the desktop background, with 28px padding and 16px corners; those dimensions belong to that companion surface rather than the general card scale.

## Elevation & Depth

Ordinary panels are flat. Background shifts and thin strokes create separation. The shared shadow (`0 12px 36px #1b261520`) belongs to the overlay drawer and toast.

**The Overlay Depth Rule.** Keep routine rows and collection cards flat; reserve the shared shadow for content above the workspace.

The drawer enters with a 200ms ease-out animation, moving 20px from the right while opacity rises from 0.8 to 1. Reduced-motion preference removes animations. Buttons change state directly without a general motion system.

## Shapes

Controls have gently curved corners; larger supporting surfaces use the surface radius. Badges and calendar entries use the small radius. Thin solid borders define interactive fields and collection cards; quick capture uses a dashed border.

Circular geometry belongs to completion controls, habit-day buttons, the small status dot, and the logo crop. Icons are outlined SVG with rounded caps and joins, generally 19px with a 1.7px stroke.

## Components

### Buttons

Restrained, readable actions use a minimum height of 38px. Primary buttons reverse paper text on olive; hover reduces brightness to 0.93. Secondary buttons use panel fill and a divider stroke, changing to tint on hover. Quiet buttons remove fill and border; destructive buttons use danger text. Disabled buttons have half opacity and a not-allowed cursor.

All interactive controls share an accent focus outline (2px) offset by 4px.

### Chips

Badges carry compact status text on tint, with olive text and small corners. Urgency is a text-only danger treatment. These badges communicate status; they are not universally interactive filters.

### Cards / Containers

Collection cards use panel fill, a single divider-colored stroke, surface corners, and 23px padding. Daily summaries and notices use sage paper without a shadow. Ledger tasks remain divided rows.

### Inputs / Fields

Fields use panel fill, ink text, muted placeholders, and a divider stroke. They share the global focus outline. Textareas start at 100px and resize vertically. Labels sit above fields; validation uses danger text and an alert region in drawers. Quick capture is a transparent dashed field.

### Navigation

Navigation buttons align left with outlined icons, muted default text, and a tint-plus-accent active state. The active destination carries `aria-current="page"`. The original monkey asset is displayed alongside the wordmark. Compact navigation removes icons and retains text labels.

### Task ledger

Task rows combine a circular completion button, flexible title and metadata region, and due information. Completed tasks combine filled completion state with a struck-through title. Title wrapping and metadata wrapping accommodate long content. Completion and task opening are separate controls.

### Detail drawer

A panel-colored drawer attaches to the right viewport edge (440px, capped at viewport width), fills viewport height, and scrolls internally. It uses dialog semantics, makes the background inert, traps Tab navigation, closes with Escape, and restores focus to the opener. Its close action is a labeled SVG button.

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


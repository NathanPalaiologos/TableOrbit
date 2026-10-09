# Interaction design — 2026-10-08

Selected with the user: **A — arrows explore the data; Shift + arrows move the selected cell.** The reader remains a table, with two orthogonal views. No new navigation mode, gamification or framework is introduced.

The top-left Quick guide is an opt-in native dialog with identical English/Chinese structure. It explains keys, selection, summaries and figures, with import instructions under a disclosure. Esc closes it and returns focus to its trigger. It neither changes the dataset nor changes the selected cell. Status facts use separate wrapping text fields with spacing instead of decorative dot separators. Preset descriptions use complete sentences instead of semicolon chains. The guide trigger's hover underline is intentional interaction feedback, not decorative emphasis.

## Inputs and focus

| Context | Input | Action |
|---|---|---|
| Focus in panel reader | Up / Down | Previous / next layer: period in cross-section, variable in time-series. |
| Focus in panel reader | Left / Right | One 90° turn per physical press. Holding does not spin repeatedly. |
| Focus in any raw/aggregated table | Shift + arrows | Move the selected cell through included entities and visible columns. Stop at boundaries. Cross pages automatically. Aggregated tables have one row. |
| Select, search field, text field | Arrows / Shift + arrows | Native control behavior; never reader navigation. |
| Dialog open / IME composing | Reader keys | Reader does not handle them. |
| Summary, current-period scope | Up / Down in reader | Previous / next period. No rotation or cell-moving shortcut. |
| Summary, all-period scope | Arrows | Native scrolling; no hidden change to the selected period. |
| Anywhere | Ctrl / Alt / Meta combinations | Left to the browser, host or native control. |

Reading buttons and dropdowns keep their focus. Dialogs return to their invoking controls. Dataset switching restores focus to the switcher when it initiated the change. Clicking a cell selects it without changing key semantics. The footer shows the active keyboard mapping only when the reader owns focus; otherwise it explains how to enter the reader. A focus outline identifies the active reading area.

## Feel and feedback

Layer changes keep text stationary; only a 160 ms edge indicator fades. Rotation is shortened to 220 ms and respects reduced-motion preferences. A new discrete navigation input settles an unfinished rotation before continuing, instead of accumulating spins. Held layer/cell movement is capped at one accepted repeat per 85 ms; separate quick taps are not discarded. Unchanged boundary movement avoids rebuilding the table.

Selected coordinates remain entity/time/variable coordinates. Filtering variables or entities does not change their meaning. Cell movement within a page updates selection only; it does not rebuild all cell elements. Crossing a page rebuilds the bounded page and restores the selected cell's focus and visibility.

## Plot workflow

1. Choose Create figure in the top toolbar. The reading variable, entity and period seed the controls.
2. Choose **Y / measure** directly. All numeric source variables are available, including ones hidden from the reading table. Scatter additionally exposes **X variable** and **Swap X/Y**.
3. Choose one searchable entity, all included entities, or a searchable custom checklist. Custom selection retains choices across searches. The checklist shows at most 100 matches at a time. Aggregated figures retain the reader's explicitly included population.
4. Raw bar/scatter plots expose a period selector. Lines/histograms keep their existing all-period definition.
5. Draw explicitly. Style and physical size are under a collapsible section. Changing data disables stale exports; changing entities or period preserves edited axis labels. Changing variables/type regenerates suitable labels.

Plot choices are local to the dialog. They never change the reading coordinate, table variable visibility or included population. The renderer, missing-value policy and export formats remain unchanged. Limits (8 raw lines, 40 bars, 12,000 positions) remain explicit; no silent sampling or blending of variables with different units.

## Confirmed defects addressed

- The layer dropdown moved focus into the reader after each change; the next arrow could rotate/flip data instead of adjusting the control.
- Aggregation and selection confirmation also moved focus away from their initiating controls.
- Rebuilding a select's options during each render interfered with native keyboard interaction. Options now rebuild only when their contents differ.
- Held left/right input generated repeated rotations; key-repeat policy now distinguishes one-shot turns from repeatable movement.
- A plot's Y variable was implicitly bound to the selected table cell, forcing a return trip to the reader. It is now explicit and independent.

## Skills used and interpretation

- `ui-ux-game`: consistent actions, visible state and progressive disclosure; applied to input hints and the simpler figure form.
- `input-handling`: controls consume input first, one routing point per action, distinct one-shot and repeated input. These principles are adapted to DOM events; no Godot code is used.
- `game-design-fundamentals`: improve the short select → inspect → turn → plot loop before adding systems.
- `web-design-guidelines`: focus ownership, semantic controls, labelled inputs and reduced motion. Relevant [source checklist](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) reviewed; unrelated framework/URL-state prescriptions were not adopted.
- `grill-me`: resolved the consequential key-mapping choice with one question, then implemented option A selected by the user.

## Validation and remaining limits

15 focused interaction, navigation, analysis and summary checks passed in this iteration. They cover control/IME/modifier priority, repeat routing, filtered cell coordinates, boundaries, and plot-variable independence. Browser checks cover consecutive layer-dropdown arrows retaining focus; dataset/aggregation dropdown focus; Tab leaving the table; Shift movement in both faces; row-page crossing; direct Y and X/Y swapping; custom entities; actual figure rendering; original values in the downloaded recipe; modal focus return and unchanged reader coordinates. Space toggles a custom-entity checkbox without removing its focus, and Tab reaches the next checkbox. A right/left/down sequence settles on the correct cross-section and period without leaving duplicate faces. No browser console errors were observed in the final check.

Physical held-key behavior across every OS/browser and assistive-technology combination remains unverified. IME and OS-repeat routing are tested at the event-policy level. Comfort remains a user judgment; these checks establish deterministic behavior, not universal usability.

## Presentation curation and figure visibility

Subsequent multi-table update: Combine tables joins the secondary import actions, with Create figure retaining the primary accent. Four actions share a row below 1050 px and wrap to two columns below 540 px. The local composer separates operation, explicit key pairs, cardinality and added columns, then shows an audit before handing the result to axis mapping. CLI-managed database access is a selected design direction, not a completed integration. See [MULTITABLE_CONNECTIONS.md](MULTITABLE_CONNECTIONS.md).

The presentation menu contains three complementary panels: Grunfeld for a compact balanced firm panel, Gapminder for country comparisons over time, and NLS work for a larger unbalanced person panel. Grunfeld remains the initial dataset. Cross-section, wide-import and single-series fixtures remain at their existing paths for tests and manual import. No source data or analytical sample changed.

Create figure is the sole filled primary button in the main view, using the existing blue accent. Draw repeats that hierarchy inside the figure dialog. Export table moves to the table tool row, alongside selections and summary statistics. Entity and variable counts stay grouped with their buttons when controls wrap. Below 900 px, import and figure actions occupy their own row, while the dataset and language controls stay above. Both languages share this structure. Plot calculations, scope, keyboard routing and the existing summary-mode restriction are unchanged.

The visual scan reports only the Quick guide hover underline, retained as intentional feedback. The update passed 17 focused import, reader and analysis checks. Browser verification covers the three curated datasets, a rendered Gapminder time-series figure with enabled exports, Chinese figure controls and focus returning to the trigger after closing. Toolbar geometry was checked at 480, 746 and 1200 px, with no horizontal toolbar overflow. The viewport was restored after checking. No full test suite or new package installation was needed. Native VS Code verification remains outstanding.

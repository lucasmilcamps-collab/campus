# Components

Specs for every repeated part in `replica/recon.md` → Components. Tokens are role names
from `tokens.json`. Classes assume `tailwind.preset.js`, where spacing is index-based
(`p-4` = 16px, `gap-2` = 8px).

Target: Expo (React Native) first, the web second. "a11y" lists both: RN props
(`accessibilityRole`, `accessibilityState`, `accessibilityLabel`) and the web element
or ARIA. Every touch target is at least 44×44 (`min-h-touch`), even when it looks
smaller.

Shared rules, so they aren't repeated in every block:

- **Focus-visible:** a 2px `focus` ring with a 2px offset, on the web and with an RN
  hardware keyboard. Never remove the outline without a replacement.
- **Disabled:** 40% opacity, no press feedback, and `accessibilityState.disabled` /
  `disabled` set. A disabled control never carries an error.
- **Loading:** keep the element's size, swap the content for a spinner, and keep the
  label for screen readers (`accessibilityState.busy` / `aria-busy`).
- **Pressed:** on native, a 0.97 scale plus a background shift, over `motion.fast`. On
  the web, the hover colour.
- **Reduced motion:** opacity-only transitions.
- **Colour:** effort colours (session type, pace zone, RPE) always come with a text
  label or a number.
- **Numbers:** paces, durations and distances use tabular figures.
- **Copy:** all copy is our own, written in FR first, with EN and NL second. No string
  from the original.
- **Icons:** Lucide (ISC licence), 20px in rows and 24px in the tab bar, stroke 1.75.
  No icon, illustration or logo from the original.

---

```
Button
  variants  primary (accent), secondary (surface + border), ghost (no bg), danger, brand-auth (Apple / Google, per their own guidelines)
  sizes     sm 36px (still 44px hit area), md 44px, lg 52px (main CTAs on S02, S06, S07, S10)
  states    default, pressed, focus-visible, disabled, loading
  tokens    primary: bg accent, text on-accent · secondary: bg surface-raised, border border, text text · danger: bg danger, text on-danger
            radius md, type base/600 (sm: sm/600), px 5 (20px), gap 2 between icon and label
  layout    full-width at the bottom of a screen ("sticky CTA": pb 4 + safe area); inline elsewhere
  a11y      RN Pressable accessibilityRole="button"; web <button type="button">. The label is a verb ("Créer mon plan").
            Loading keeps the label as accessibilityLabel. Apple and Google buttons follow each platform's HIG and are not restyled.
  used on   S01 S02 S05 S06 S07 S10 S11 S13 S15 S16 S20 S22 S24 S25 S26
```

```
IconButton
  variants  plain, filled (surface), on-overlay (tracker on a map)
  sizes     40px visual, 44px hit area
  states    default, pressed, focus-visible, disabled, toggled (aria-pressed / accessibilityState.selected)
  tokens    icon text or text-muted; filled bg surface; radius pill
  a11y      an accessibilityLabel is required (no visible text); a lint rule fails the build without it
  used on   headers, S12 (pause, lap, audio), S14 (share)
```

```
ChoiceCard
  variants  single (radio), multi (checkbox), with-icon, with-description, large-goal (S05: icon + title + sub)
  states    default, pressed, selected (2px accent border, accent-soft bg, check icon), disabled, focus-visible, error (group level)
  tokens    bg surface-raised, border border → accent when selected, radius md, p 4, title base/600, description sm text-muted
  a11y      single: accessibilityRole="radio" inside a radiogroup, and the arrow keys move selection on the web.
            multi: role="checkbox". State is announced ("sélectionné"). The group has a visible question as its label.
  used on   S02 (each question), S05 (goals), S07 (plan cards reuse it), S13 (pain yes/no)
```

```
ProgressBar / Stepper
  variants  onboarding (segmented, n steps), plan (continuous, week x of n), challenge (value / target)
  states    determinate; no indeterminate state (that's Spinner)
  tokens    track border, fill accent (always accent, never an effort colour), height 4px, radius pill
  a11y      accessibilityRole="progressbar" with value {min, max, now}. Onboarding also shows "Étape 3 sur 10" as text.
  used on   S02, S08 (to race), S09, S23
```

```
SegmentedControl
  variants  2–5 segments, text or text + caption ("4 / sem." over "≈ 38 km")
  states    default, selected, pressed, disabled segment, focus-visible
  tokens    track surface, selected segment bg surface-raised + shadow card, text text; unselected text-muted; radius md (inner sm)
  a11y      a radiogroup with arrow-key support; each segment is a radio with its full caption as the label
  used on   S06 (3/4/5 sessions per week, with the impact preview below), S07 (monthly / yearly), S18 (8w / 26w / 1y)
```

```
Stepper (number)
  variants  pace tolerance (±s/km), target time (h:mm:ss wheel on native), weekly volume
  states    default, at-min, at-max (that button disabled), focus-visible, error
  tokens    value lg/600 tabular, buttons IconButton filled
  a11y      accessibilityRole="adjustable" with increment/decrement actions; web role="spinbutton" + aria-valuenow/min/max/valuetext ("15 secondes par kilomètre")
  used on   S02, S05, S11
```

```
TextField / TextArea
  variants  text, email, number, time (mm:ss pace), multiline note
  sizes     44px single line; textarea 3–8 lines, auto-grow
  states    default, focus (border accent + ring), filled, error (border danger + message), disabled, read-only
  tokens    bg bg, border border-input, radius md, px 4, text base, placeholder text-muted, label sm/600 above, help/error xs below
  a11y      a visible label always (never placeholder-only); the error is linked (aria-describedby / accessibilityHint) and announced on submit;
            keyboard type matches the field (email, numeric); autofill hints for email and name
  used on   S01, S02, S13 (note), S15, S19 (search), S22
```

```
DatePicker
  variants  day (session move, export date), race date (calendar month), date-of-test
  states    default, open, day: today, selected, disabled (outside plan / before today / past race), focus-visible
  tokens    sheet bg surface-raised; selected day bg accent text on-accent; today ring accent; disabled text-muted 40%
  a11y      native: the platform picker. Web: a grid role with arrow-key navigation, and each day labelled with its full date ("mardi 20 octobre")
  used on   S05, S11, S15, S16, S26
```

```
WeekStrip
  variants  —
  states    per day: today, selected, has-session (effort dot), done (check), missed (hollow dot + text-muted), rest
  tokens    day label xs text-muted, date sm/600, selected bg accent text on-accent radius pill, dot 6px effort-N
  a11y      a horizontal list of buttons; each label reads "mardi 20, séance VMA, faite"; swipe changes the week, with prev/next buttons for switch and keyboard users
  used on   S08
```

```
SessionCard
  variants  compact (week list, S08/S09), hero (today on S08: bigger title, CTA row), past (journal, S17)
  types     easy, long, vma, threshold, race_pace, hills, trail, strength, test, race, rest → effort 0–5 (tokens.json effort_map)
  states    planned, today, done (check + actual distance), missed ("manquée" label + text-muted, no strikethrough), skipped, locked (paid plan ended; lock icon),
            stale-export (warning dot), loading skeleton
  tokens    bg surface-raised, radius lg, p 4, shadow card; a 4px left bar in effort-N; type chip = EffortChip; title lg/600; meta sm text-muted tabular
  a11y      the whole card is one button. Label: "Jeudi, fractionné VMA, 6 fois 3 minutes, 52 minutes, prévue".
            The status is in the text, not only the icon.
  used on   S08, S09, S17
```

```
EffortChip
  variants  session-type, pace-zone, rpe
  sizes     sm 24px, md 28px
  states    default only (it's a label)
  tokens    bg effort-N-soft, text effort-N-ink, xs/600 uppercase-free, radius pill, px 2
  a11y      plain text; no role
  used on   S04 S08 S09 S10 S12 S13 S14 S17
```

```
WorkoutStepList
  variants  plan (S10), live (S12: current step highlighted, the rest dimmed), review (S14: planned vs actual columns)
  rows      warmup, work, recovery, cooldown, repeat group (indented children, "× 6" badge)
  states    upcoming, current (accent-soft bg, accent left border), done (check, text-muted), off-target (review: warning text and an icon)
  tokens    row py 3, gap 3; pace in EffortChip; duration/distance base tabular; repeat badge bg surface radius pill
  a11y      a list; repeat groups are nested lists with the label "6 répétitions". Live mode announces step changes through
            an accessibility announcement (AccessibilityInfo.announceForAccessibility), in addition to audio cues.
  used on   S10, S12, S14
```

```
PaceChip
  variants  single pace ("4:35 /km"), range ("5:40–6:05 /km"), with zone name
  tokens    = EffortChip by zone, plus value sm/600 tabular
  a11y      label spells the unit out: "4 minutes 35 par kilomètre"
  used on   S04, S10, S12, S14
```

```
PaceZoneTable
  variants  estimated (badge "estimation"), test-based (badge with date)
  states    loading, filled, stale-reference (warning-soft banner: "Ta référence date de plus de 6 mois")
  tokens    rows separated by border; zone name with EffortChip; range right-aligned tabular
  a11y      a real table (web <table>, RN accessibilityRole="list" with row labels)
  used on   S04, S26
```

```
RPEScale
  variants  5 steps (1 easy → 5 extreme), with face icons (Lucide) and words
  states    none selected, selected (filled effort-N, ring), focus-visible, error ("Choisis un ressenti")
  tokens    each step a 56px circle bg effort-N-soft, icon effort-N-ink; selected = 2px ring effort-N + label sm/600 below
  a11y      a radiogroup labelled "Comment t'es-tu senti ?"; each radio has its word ("Très facile" … "Extrême"); arrow keys move selection
  used on   S13
```

```
LiveMetricTile
  variants  hero (one big metric: pace or step-remaining, type metric 64), small (2×2 grid: time, distance, avg pace, D+)
  states    normal, off-pace (too fast / too slow: warning text + arrow icon, label "trop rapide"), paused (text-muted, "PAUSE"), gps-weak (warning badge)
  tokens    tracker screen is always the dark palette (it's read in sunlight and at dawn: big type and high contrast); value metric tabular; label xs text-muted
  a11y      values aren't announced on every change (that's noise); they are announced on step change, every km, and on request (tap the tile)
  used on   S12
```

```
Chart
  variants  bar (weekly volume, S09/S18), line (pace trend, S18), planned-vs-actual (S14: bars per step with target band)
  states    loading skeleton, empty ("Pas encore de données — tes séances apparaîtront ici"), filled, partial (no HR)
  tokens    follow the dataviz skill: bars accent (current week) and border (others); target band accent-soft; axis text xs text-muted; gridlines border
  a11y      each chart has a text summary ("Volume des 8 dernières semaines : de 22 à 38 km") and a data-table toggle
  used on   S09, S14, S18
```

```
MapView
  variants  route (S14), race location (S20)
  states    loading, loaded, no-GPS (hidden; show the summary only)
  tokens    route line accent 4px; start and end markers; IconButton on-overlay for recentre
  a11y      decorative for screen readers (hidden); the distance, D+ and start city are in text nearby
  used on   S14, S20
```

```
BottomSheet
  variants  action (export S11, move S16), filter (S19), picker (date, tolerance)
  states    closed, opening, open (half / full), dragging, closing
  tokens    bg surface-raised, radius lg (top corners), shadow sheet, handle 36×4 border, backdrop overlay at 40%
  a11y      focus moves into the sheet and is trapped there; Escape / back closes it; it has a title (accessibilityViewIsModal / role="dialog" aria-modal);
            focus returns to the trigger. Never the only way to do something without a visible close button.
  used on   S11, S16, S19, date and tolerance pickers
```

```
Dialog (confirm)
  variants  confirm, destructive (delete account, abandon plan)
  states    open, submitting
  tokens    bg surface-raised, radius lg, shadow pop, p 6; actions right-aligned (web) / stacked (native)
  a11y      role="alertdialog" for destructive; the primary action isn't focused by default in the destructive variant
  used on   S24 (abandon plan, delete account), S16 (two hard days in a row → "Déplacer quand même ?")
```

```
PaywallCard
  variants  free, training-month, training-year (badge "recommandé", shows monthly equivalent), pro-link
  states    default, selected, current-plan, trial-available ("14 jours offerts"), trial-used, purchasing, error, restore
  tokens    = ChoiceCard + price xl/700 tabular + period sm text-muted; badge bg accent text on-accent radius pill
  a11y      a radiogroup; the price is read in full ("119 euros par an, soit 9,92 euros par mois"); the store's legal text sits below and is never hidden
  used on   S07
```

```
Banner / Toast
  variants  info (plan updated: accent-soft + accent-ink), success, warning (stale export, GPS weak), error
  states    shown, dismissing; a toast auto-hides after 4 s unless it has an action; a banner stays until dismissed
  tokens    radius md, p 3, sm text; the icon matches the variant; an action is a ghost Button sm
  a11y      toast role="status" (polite); error role="alert"; the "plan updated" banner carries the adjustment summary and a "Voir" link to the diff
  used on   S08 (plan_adjustments.summary), S11, S12, S14, global
```

```
ListRow
  variants  nav (chevron), toggle (Switch), value (right text), connected-app (logo + status), destructive
  states    default, pressed, disabled, loading (toggle/connect)
  tokens    min-h touch (52px for two-line), px 4, divider border, title base, subtitle sm text-muted
  a11y      nav = button with the destination in the label; toggle = switch role with on/off state; connected-app reads "Strava, connecté, dernière synchro il y a 2 h"
  used on   S24, S25, S17
```

```
Switch
  states    off, on, disabled, focus-visible
  tokens    track off border-input, on accent; thumb surface-raised
  a11y      accessibilityRole="switch"; web <button role="switch" aria-checked>
  used on   S24 (nutrition, reminders), S11 (auto-update exports)
```

```
RaceCard
  variants  list (S19), goal (S05/S08 header), compact (crew event)
  states    default, pressed, goal-set (check badge), past (text-muted, "terminée"), pending (user-submitted, "en vérification")
  tokens    date block (day xl/700 + month xs), name lg/600, meta sm text-muted (city · 21,1 km · D+ 350 m), members xs with an icon
  a11y      the whole card is one button; the label includes the date, distance and city
  used on   S05, S19, S20, S22
```

```
Badge (achievement)
  variants  earned, locked
  tokens    our own illustrations (commissioned); locked = 40% opacity + lock icon
  a11y      label "Badge Premier 10 km, obtenu le 3 mai" / "verrouillé"
  used on   S23
```

```
TabBar
  tabs      Accueil (home), Plan (calendar), Courses (flag), Communauté (users), Profil (user). Five tabs; Communauté is hidden until milestone 4, which leaves 4.
  states    active (accent icon + label), inactive (text-muted), badge (unseen plan update)
  tokens    height tabbar 56 + safe area, bg surface-raised, top border border, label xs/500
  a11y      accessibilityRole="tab" in a tablist; label always visible (not icon-only); the badge is announced
  used on   all main screens
```

```
Header
  variants  large-title (tab roots), standard (pushed screens: back + title + action), transparent (S12 tracker, S14 over a map)
  tokens    height header 52, title lg/600 (large: xl/700), bg bg
  a11y      the title is a header role; back has the label "Retour"
  used on   all
```

```
EmptyState
  variants  no-plan (S08: CTA "Choisir un objectif"), no-activity (S17/S18), no-crew (S22), no-results (S19: "Ajouter une course")
  tokens    our own illustration (optional, 120px), title lg/600, body sm text-muted, one primary Button
  a11y      the illustration is decorative; the CTA is a real button
  used on   S08, S17, S18, S19, S22
```

```
Skeleton / Spinner
  variants  skeleton line, block, card; spinner sm/md
  tokens    skeleton bg surface with a shimmer (no shimmer under reduced motion); spinner accent
  a11y      the container is busy; the skeleton is hidden from screen readers; a spinner has a label ("Chargement")
  used on   all data screens
```

## Screen → component checklist

| screen | components |
| --- | --- |
| S01 | Button (brand-auth, primary), TextField, Header |
| S02 | ProgressBar (onboarding), ChoiceCard, Stepper, TextField, Button (sticky) |
| S04 | PaceZoneTable, PaceChip, EffortChip, Banner, Button |
| S05 | ChoiceCard (large-goal), RaceCard, DatePicker, Stepper (target time), Button |
| S06 | SegmentedControl (with caption), Chart (bar preview), Banner (warning), Button |
| S07 | PaywallCard, Button, Banner (error), Spinner |
| S08 | Header (large), WeekStrip, SessionCard (hero + compact), ProgressBar, Banner (plan updated), EmptyState, TabBar |
| S09 | Chart (bar), SessionCard (compact), EffortChip |
| S10 | Header, EffortChip, WorkoutStepList (plan), PaceChip, Button (Start, Export), IconButton (move) |
| S11 | BottomSheet, Stepper (tolerance), DatePicker, Switch, Banner |
| S12 | LiveMetricTile, WorkoutStepList (live), IconButton (on-overlay), Banner (gps-weak), Dialog (stop?) |
| S13 | RPEScale, ChoiceCard (pain), TextArea, Button |
| S14 | WorkoutStepList (review), Chart (planned vs actual), MapView, IconButton (share) |
| S15 | TextField, DatePicker, ChoiceCard (sport), RPEScale, Button |
| S16 | BottomSheet, DatePicker, Dialog (confirm) |
| S17 | SessionCard (past), EmptyState |
| S18 | SegmentedControl, Chart (bar, line), EmptyState |
| S19 | TextField (search), BottomSheet (filter), RaceCard, EmptyState, Skeleton |
| S20 | MapView, RaceCard (header), Button |
| S24 | ListRow, Switch, Dialog (destructive) |
| S25 | ListRow (connected-app), Button (brand) |
| S26 | PaceZoneTable, TextField (time), DatePicker, Button |
| S21–S23 | later; ListRow, Badge, ProgressBar, EmptyState |

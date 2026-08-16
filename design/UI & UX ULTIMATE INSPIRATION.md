1. design\previews\goodl coloring and branding - ignore anything else.jpg
[BELOW DESCRIPTIONS MIGHT NOT BE ACCURATE SO PLEASE FIRST SEE THE IMAGE]
## Layout / Structural Composition

The reference uses a **desktop-first trading-terminal composition** built around a fixed shell, persistent navigation, a compact market header, and a two-column trading workspace.

### 1. Overall canvas

* Full-screen dark application canvas.
* The application is contained inside a large rounded outer shell.
* Outer shell nearly fills the viewport, leaving a very small margin around all sides.
* Corners are strongly rounded, approximately **28–32px**.
* The shell has a very subtle outer glow/border.
* Content is clipped cleanly inside the rounded boundary.
* Overall composition is **dense and information-rich**, with very little unused space.

Approximate proportions:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         GLOBAL HEADER                                 │
├───────────────┬──────────────────────────────────────────────────────┤
│               │                                                      │
│               │                MAIN WORKSPACE                        │
│   SIDEBAR     │                                                      │
│               │      ┌────────────┐    ┌─────────────────────────┐   │
│               │      │            │    │                         │   │
│               │      │ TRADING    │    │      PRIMARY CHART       │   │
│               │      │ PANEL      │    │                         │   │
│               │      │            │    │                         │   │
│               │      └────────────┘    └─────────────────────────┘   │
│               │                                                      │
│               │                         ┌─────────────────────────┐   │
│               │                         │ SECONDARY CONTENT       │   │
│               │                         └─────────────────────────┘   │
└───────────────┴──────────────────────────────────────────────────────┘
```

---

# 2. Global shell

The application has three primary structural zones:

1. **Global top header**
2. **Persistent left navigation**
3. **Scrollable/main trading workspace**

The top header spans the full application width **except for the visual division created by the sidebar**.

The sidebar and header establish the permanent navigation frame, while the center/right area contains the changing trading content.

---

# 3. Global header

### Height

Approximately **80px**.

The header is relatively shallow compared with the workspace.

It contains several horizontally distributed groups:

```text
[Brand] ───────── [Asset summary] [Market metrics] [Indicators] ───── [Utilities] [User]
```

### Left section

The brand block occupies roughly **190–220px** of horizontal space.

It contains:

* Brand identity
* Small status/subtitle information
* Compact utility/menu control

The brand area is visually aligned with the sidebar beneath it.

### Center market strip

Immediately after the brand region is a horizontally arranged market-information strip.

Several compact metric groups sit side-by-side.

Each group follows roughly:

```text
[icon]  [label]
        [value]
```

The groups have consistent spacing and vertical alignment.

### Right utility cluster

The far-right region contains a compact horizontal utility group:

* Theme/control icon
* Notification/control icon
* User/avatar control
* Small dropdown affordance

This region is pushed against the right side with approximately **30–40px internal padding**.

---

# 4. Header spacing

The header uses a **tight information-terminal rhythm**.

Approximate:

* Horizontal header padding: **40–44px**
* Major group gap: **25–35px**
* Metric-to-metric spacing: **25–30px**
* Icon-to-label gap: **7–10px**
* Label/value vertical gap: **2–4px**

There is very little vertical whitespace.

Everything is intentionally compact.

---

# 5. Sidebar

The sidebar is approximately **240px wide**.

It extends from below/alongside the header through the full remaining viewport height.

A thin vertical divider separates it from the main workspace.

### Internal structure

The sidebar is divided into logical vertical sections:

```text
Brand / selector
       ↓
Asset selector
       ↓
Primary navigation
       ↓
Navigation subsection
       ↓
Secondary navigation
       ↓
Lower navigation/content
```

### Top selector region

Immediately below the header region is a compact selector/control row.

It contains:

* A wide selector
* A small adjacent action button

The selector occupies most of the available width while the action button occupies a small fixed width.

Approximate:

* Sidebar horizontal padding: **40–42px**
* Selector height: **28–30px**
* Gap between selector and action: **7–9px**

---

# 6. Sidebar navigation

Navigation begins with a moderate vertical gap after the selector.

Each navigation row contains:

```text
[icon] [label]
```

Rows are approximately **30–34px high**.

The content is vertically centered.

### Navigation indentation

Navigation content begins approximately **42px from the application edge**, giving the sidebar a comfortable internal gutter.

### Row spacing

The rows are relatively tight:

* Row height: ~30–32px
* Vertical gap: ~1–3px

This contributes to the dense trading-terminal aesthetic.

---

# 7. Active navigation state

The active navigation item uses a horizontally elongated rounded background.

Important structural characteristics:

* Nearly full sidebar content width
* Small left/right internal padding
* Rounded corners
* Icon and label remain aligned with inactive rows
* Active background is visually subtle rather than oversized

The active item doesn't change the navigation's geometry; it simply adds a background layer.

This is important for maintaining stable navigation.

---

# 8. Navigation section hierarchy

A small section label separates major navigation groups.

The section label:

* Uses smaller typography
* Has increased top spacing
* Has reduced bottom spacing
* Does not occupy much vertical space

The hierarchy is therefore:

```text
Navigation item
Navigation item
Navigation item
Navigation item

Section label

Navigation item
Navigation item
Navigation item
Navigation item
```

Rather than using large section headers.

---

# 9. Main workspace

The workspace begins immediately to the right of the sidebar.

It has approximately **26–30px internal horizontal padding**.

The main content is organized into **two primary columns**.

### Column ratio

Approximately:

```text
Trading panel : Chart area
     1        :     2.4–2.6
```

Visually:

* Left trading panel: ~290px
* Gap: ~20px
* Right chart region: ~640px+

The chart dominates the workspace.

---

# 10. Main content top alignment

The trading panel and chart begin on approximately the **same horizontal baseline**.

Both are enclosed in independent rounded surfaces.

```text
┌───────────────────┐    ┌──────────────────────────────────────┐
│                   │    │                                      │
│ Trading panel     │    │ Chart                                │
│                   │    │                                      │
│                   │    │                                      │
│                   │    │                                      │
└───────────────────┘    └──────────────────────────────────────┘
```

This creates a strong visual grid.

---

# 11. Trading panel

The left workspace panel is a vertically stacked form/trading module.

Its internal structure follows:

```text
Panel header
──────────────
Account summary
──────────────
Buy/Sell control
──────────────
Input group
Input group
──────────────
Slider/control
──────────────
Additional controls
```

### Panel padding

Approximately **14–16px** on all sides.

### Header

The top header has:

* Asset/icon indicator
* Pair/title
* Market/source selector on the right

A horizontal divider follows the header.

---

# 12. Trading panel vertical rhythm

The panel uses a repeated spacing system.

Approximate:

* Header height: **45px**
* Section gap: **18–22px**
* Label → value gap: **6–8px**
* Input height: **44–46px**
* Input-to-input gap: **14–16px**
* Divider spacing: **14–16px**

The panel is compact but not cramped.

---

# 13. Account section

The account section contains two vertically stacked information rows.

Each follows roughly:

```text
Label                         Action/value
```

The rows have a generous horizontal spread.

A divider separates the account area from the transaction controls.

This creates three distinct vertical zones:

```text
Header
   ↓
Account information
   ↓
Trading controls
```

---

# 14. Buy/Sell control

The transaction mode selector is a **two-segment horizontal control**.

It occupies almost the entire width of the panel.

```text
┌─────────────────────────────────────┐
│        LEFT        │       RIGHT    │
└─────────────────────────────────────┘
```

Both segments have equal width.

The active segment visually fills its half while the overall control remains a single unified object.

Height is approximately **34–38px**.

---

# 15. Input groups

Each trading input follows a consistent vertical pattern:

```text
Label
↓
Input/control
```

The input spans almost the full panel width.

Inputs have:

* Fixed height around **44px**
* Rounded corners
* Internal horizontal padding around **12–14px**
* Right-side action/value where applicable

This creates a consistent form grid.

---

# 16. Slider / range control

The leverage-style control is positioned below the numeric inputs.

Its structure is:

```text
Label/value
──────────────
[████████|████]
low       high
```

The slider occupies essentially the complete usable panel width.

Its visual marker sits directly on the track.

The labels at the ends align with the track edges.

---

# 17. Chart container

The chart is the dominant visual object.

It is enclosed in a large rounded rectangle.

Approximate internal padding:

* Left: **14–16px**
* Right: **12–16px**
* Top: **12–14px**
* Bottom: **12–16px**

The chart has three conceptual horizontal zones:

```text
Chart metadata / controls
──────────────────────────
Timeframe controls
──────────────────────────
Main visualization
──────────────────────────
Volume visualization
```

These are not separate cards; they exist as internal chart regions.

---

# 18. Chart header

The chart header is a compact horizontal toolbar.

Left side:

* Instrument/market metadata

Right side:

* Display mode
* Chart controls
* Utility icons

The toolbar remains approximately one line high.

It should not consume significant chart height.

---

# 19. Timeframe navigation

Directly beneath the chart metadata is a horizontal timeframe selector.

It is aligned toward the left.

Each timeframe option is compact and evenly spaced.

The selected timeframe uses a thin highlight indicator underneath.

Important structural property:

**The selector is not presented as large buttons.**

It behaves more like a compact tab/navigation strip.

---

# 20. Chart plotting region

The actual graph occupies the majority of the chart card.

It has substantial vertical breathing room compared with the surrounding controls.

The plotting region uses:

* Large horizontal span
* Fixed right-side numerical axis
* Bottom time axis
* Main price visualization
* Lower volume visualization

The right axis remains visually attached to the chart rather than occupying a separate panel.

---

# 21. Chart axes

### Right axis

A narrow dedicated area on the right contains numerical values.

The numbers are vertically distributed.

The axis occupies approximately **45–55px** of width.

### Bottom axis

The time labels are horizontally distributed across the plotting width.

They sit directly beneath the graph.

The labels are small and compact.

---

# 22. Main chart / volume relationship

The chart uses a **stacked vertical visualization**:

```text
┌─────────────────────────────────────┐
│                                     │
│          PRICE CHART                │
│                                     │
│                                     │
├─────────────────────────────────────┤
│       VOLUME CHART                  │
└─────────────────────────────────────┘
```

The price chart receives roughly **70–75%** of the plotting height.

The volume region receives approximately **20–25%**.

There is little separation between them.

They read as one continuous financial visualization.

---

# 23. Secondary content below chart

A second large content card begins underneath the primary chart.

There is a relatively small vertical gap, approximately **20px**.

The next card spans the **same width as the chart above**.

This creates a strong vertical alignment:

```text
┌──────────────┐  ┌──────────────────────────┐
│              │  │                          │
│ Trading      │  │ Primary chart            │
│ panel        │  │                          │
│              │  │                          │
└──────────────┘  └──────────────────────────┘
                  ┌──────────────────────────┐
                  │ Secondary market content │
                  └──────────────────────────┘
```

The secondary card appears designed to continue below the viewport.

---

# 24. Horizontal grid

The main workspace uses a consistent column grid.

```text
Workspace width
│
├── Left panel
│
├── ~20px gutter
│
└── Right content
```

The right content width remains stable across stacked cards.

This is important: **the chart and the content underneath share the same left and right boundaries.**

---

# 25. Alignment system

Several vertical alignment lines are maintained throughout the interface:

### Left edge

Sidebar content shares a common internal left edge.

### Workspace

Trading panel and chart share the same top edge.

### Chart stack

Primary chart and secondary card share the same width.

### Header

Market metrics are aligned along a common baseline.

### Controls

Inputs, selectors, and buttons use consistent horizontal boundaries.

The composition is therefore highly grid-driven despite the visually dense appearance.

---

# 26. Spacing system

The design appears to use a relatively small spacing scale rather than arbitrary spacing.

A useful reconstruction would be approximately:

```text
4px   micro spacing
8px   icon/control spacing
12px  compact internal spacing
16px  standard component spacing
20px  section spacing
24px  major component gap
32px  workspace/header spacing
40px  shell/sidebar padding
```

The most frequently occurring values are around **8 / 12 / 16 / 20 / 24px**.

---

# 27. Density

The interface deliberately has **high information density**.

It avoids:

* Large empty margins
* Oversized cards
* Huge headings
* Excessive vertical spacing

Instead, it prioritizes:

* More information per viewport
* Tight alignment
* Compact controls
* Persistent context
* Dense market visualization

This makes it feel like a **professional trading workstation rather than a consumer dashboard**.

---

# 28. Responsive behavior implied by the composition

The screenshot strongly suggests a desktop-oriented layout.

At smaller widths, the logical adaptation would be:

```text
Desktop
Sidebar + trading panel + chart

        ↓

Tablet
Collapsible sidebar + trading panel + chart

        ↓

Mobile
Collapsed navigation
Trading controls
Chart
Secondary content
```

The important architectural characteristic is that the **sidebar and trading controls are independent regions**, so they can be collapsed/reordered without destroying the core workspace.

---

## Structural blueprint

If reducing the entire reference to its pure composition:

```text
APPLICATION SHELL
│
├── GLOBAL HEADER
│   ├── Brand block
│   ├── Market summary group
│   ├── Metrics group
│   ├── Utility controls
│   └── User controls
│
├── LEFT SIDEBAR
│   ├── Asset selector
│   ├── Primary navigation
│   ├── Navigation section
│   └── Secondary navigation
│
└── MAIN WORKSPACE
    │
    ├── TOP ROW
    │   ├── TRADING / ORDER PANEL
    │   │   ├── Panel header
    │   │   ├── Account section
    │   │   ├── Mode selector
    │   │   ├── Form controls
    │   │   └── Range control
    │   │
    │   └── MARKET CHART
    │       ├── Chart toolbar
    │       ├── Timeframe navigation
    │       ├── Price visualization
    │       ├── Volume visualization
    │       └── Axes
    │
    └── SECONDARY CONTENT
        └── Full-width market information card
```

**The defining structural pattern is:** **persistent shell → fixed sidebar → compact trading controls + dominant visualization → vertically stacked secondary market content**, with a tight 8/12/16/20/24px spacing rhythm and roughly a **1:2.5 trading-panel-to-chart width ratio**.

2. design\previews\goodl coloring and branding - ignore anything else.jpg
[BELOW DESCRIPTIONS MIGHT NOT BE ACCURATE SO PLEASE FIRST SEE THE IMAGE]
The reference uses a **premium fintech / digital-gold visual language**. Below is the design system extracted **without describing the layout structure or component placement**.

## 1. Overall visual direction

**Theme:** Premium financial technology + physical precious metals.

The visual identity combines:

* Near-black / charcoal UI surfaces
* Rich metallic gold
* Soft yellow-gold illumination
* Subtle glass/translucency
* High-contrast white typography
* Restrained gray secondary text
* Photorealistic gold imagery used as luxury accents
* Very soft shadows rather than hard borders
* A polished, institutional-but-modern investment platform feel

The result should feel closer to a **private wealth / institutional gold trading platform** than a generic banking dashboard.

---

# 2. Color scheme

### Primary UI background

Use an almost-black charcoal rather than pure black:

* **Primary background:** `#101010` / `#111111`
* **Secondary dark surface:** `#181818`
* **Elevated surface:** approximately `#202020`
* **Input/control surface:** `#252525`
* **Darkest accents:** `#0A0A0A`

The blacks are deliberately **softened**. Avoid a completely flat `#000000` interface.

### Primary brand color

Gold is the dominant brand/accent color.

Suggested palette:

| Role           | Color     |
| -------------- | --------- |
| Primary gold   | `#F5D21A` |
| Bright gold    | `#FFD92E` |
| Warm yellow    | `#F8C91C` |
| Deep gold      | `#C99600` |
| Metallic gold  | `#D9A900` |
| Gold highlight | `#FFE45C` |

The gold should feel **metallic and luminous**, not orange.

### Gold gradient language

The reference frequently moves between:

**deep amber → saturated gold → bright yellow**

For example:

`#B88600 → #D9A900 → #F5D21A → #FFE45C`

Use gradients sparingly, primarily for:

* Primary CTAs
* Active states
* Brand illumination
* Decorative lighting
* Metallic imagery

Avoid making every element gold.

---

# 3. Background treatment

The outer/background environment is substantially warmer than the application itself.

### Outer background

A vivid golden/yellow field:

* Bright yellow center
* Deeper amber toward the edges
* Large diffuse radial glow
* Soft atmospheric falloff

Conceptually:

```text
        bright warm yellow
              ↓
     ┌─────────────────┐
     │     #FFE35A     │
     │  #FFD52A        │
     │       #F5C20A   │
     │ #D99A00         │
     └─────────────────┘
```

The important characteristic is **ambient golden light**, not a flat yellow background.

### Application surface

The actual product interface switches dramatically to:

* Black
* Charcoal
* Dark graphite
* Very subtle gradients

This creates a strong **luxury contrast between the gold environment and dark financial terminal**.

---

# 4. Surface styling

The UI uses a **soft elevated-card system**.

Surfaces should feel layered rather than outlined.

### Surface characteristics

* Dark charcoal fills
* Low-contrast borders
* Very subtle inner highlights
* Soft shadows
* Slight transparency where appropriate
* Rounded corners
* No heavy outlines
* No excessive separators

A good hierarchy is:

```text
Background
   ↓
Dark application surface
   ↓
Elevated charcoal surface
   ↓
Input/control surface
   ↓
Active gold surface
```

The visual difference between levels should be subtle.

---

# 5. Borders

Borders are extremely understated.

Use:

* `rgba(255,255,255,0.06)`
* `rgba(255,255,255,0.08)`
* Occasionally `rgba(255,215,40,0.25)` for gold-active states

Avoid:

```text
#FFFFFF borders
bright gray borders
1px outlines around everything
```

The reference relies much more on **contrast + elevation** than visible borders.

---

# 6. Typography color system

### Primary text

Nearly white:

`#F2F2F2`

Used for:

* Page titles
* Important labels
* Major values
* Navigation text when active/important

### Secondary text

Soft gray:

`#A5A5A5`

Used for:

* Supporting descriptions
* Metadata
* Inactive navigation
* Secondary labels

### Tertiary text

Dark gray:

`#6F6F6F`

Used sparingly for:

* Helper information
* Very low-priority metadata
* Fine-print explanations

### Gold text

Used selectively for:

* Active states
* Important financial figures
* Selected controls
* Brand emphasis
* Status indicators

The design **does not turn all important text gold**. Gold remains an accent, which makes it more valuable visually.

---

# 7. Typography character

The typography is:

* Clean
* Modern
* Compact
* Professional
* Sans-serif
* Medium-to-semibold for hierarchy
* Regular/light for supporting information

The visual hierarchy relies heavily on **weight and contrast**, rather than decorative typography.

### Recommended hierarchy

**Page title**

* Bold / semibold
* High contrast
* Compact

**Section heading**

* Semibold
* White/light gray

**Label**

* Small
* Medium
* Gray or white

**Financial value**

* Medium/semibold
* High contrast
* Sometimes gold

**Supporting metadata**

* Small
* Gray

The interface should feel **dense but not visually noisy**.

---

# 8. Gold interaction language

Gold represents **action, selection, value, and active state**.

It is not merely decorative.

Use gold for:

* Selected navigation
* Active tabs
* Primary buttons
* Selected segmented controls
* Important monetary values
* Selected options
* Status dots
* Active chart indicators
* Brand highlights

Inactive controls remain charcoal/gray.

This creates a very clear semantic rule:

> **Dark = available/inactive. Gold = selected/actionable/important.**

---

# 9. Buttons

The primary action style is a **bright gold pill/rounded rectangle**.

Characteristics:

* Saturated yellow-gold background
* Dark text
* Semibold text
* Rounded corners
* Strong contrast
* Minimal or no visible border
* Subtle glow/highlight

The button feels almost like a **physical gold surface illuminated by light**.

Secondary buttons use:

* Dark charcoal
* Gray text
* Subtle border
* Less visual prominence

---

# 10. Controls

Controls follow a dark-premium treatment.

### Dropdowns

* Dark charcoal background
* Soft rounded corners
* Light gray text
* Small muted chevron
* Very subtle border

### Segmented controls

Inactive:

* Dark/gray background
* Muted text

Active:

* Gold or gold-outlined treatment
* Bright text/contrast
* Slight visual elevation

### Inputs

* Dark graphite surface
* Light text
* Subtle rounded corners
* Minimal border
* Gold focus state

The controls should feel **integrated into the dark surface**, rather than like traditional form fields.

---

# 11. Financial data styling

Financial information is visually prioritized.

The design uses:

* Large/medium numerical values
* Strong contrast
* Compact labels
* Gold for especially important monetary figures
* Gray for supporting units and descriptions

Examples from the visual language:

* `$7,593.04`
* `4,377.77 USD/oz`
* `114,327.38 USD`
* `1.8 kg`
* `882 oz`

Numbers should look **precise and trustworthy**, not oversized like a consumer finance app.

---

# 12. Chart styling

The chart language is intentionally minimal.

### Chart background

Very dark charcoal.

### Grid

Extremely subtle:

* Dark gray
* Low opacity
* Thin

The grid should almost disappear into the background.

### Line

Gold/yellow.

### Active point

Bright gold/near-yellow.

### Chart glow

A very subtle gold glow around the active line/point can reinforce the premium aesthetic.

Avoid:

* Multicolored charts
* Strong gridlines
* Blue/green/red palettes
* Heavy chart decorations

The chart should look like a **financial terminal rendered in luxury dark mode**.

---

# 13. Status indicators

The reference uses tiny luminous indicators.

For example:

**Gold status dot**

* Small circular indicator
* Bright yellow center
* Slight glow
* Dark surroundings

This can represent:

* Market open
* Live price
* Active connection
* Selected asset

The status language should remain subtle.

---

# 14. Iconography

Icons are:

* Minimal
* Thin-line
* Monochrome
* Gray when inactive
* Gold when active

They should have a **technical fintech icon language**, rather than filled cartoon-style icons.

Active icons become gold alongside their associated active state.

---

# 15. Imagery treatment

The gold imagery is a major part of the aesthetic.

The physical gold objects are:

* Photorealistic
* Highly polished
* Warm metallic yellow
* Reflective
* Dark-background photographed
* Dramatically illuminated

The lighting emphasizes:

* Sharp metallic highlights
* Deep black reflections
* Golden reflections
* Strong edge lighting

The objects are not presented as ordinary product photography. They behave almost like **luxury 3D visual assets**.

---

# 16. Lighting language

This is one of the most important parts of the design.

The interface has a **cinematic gold lighting system**.

Use:

### Gold glow

Soft radial gradients around important gold objects.

### Ambient illumination

Large, diffuse yellow light sources rather than hard shadows.

### Metallic highlights

Very bright yellow/white reflections on gold surfaces.

### Dark contrast

The surrounding environment remains extremely dark so the gold appears luminous.

Conceptually:

```text
BLACK / GRAPHITE
        +
   soft gold glow
        +
bright metallic highlight
        =
premium precious-metal aesthetic
```

---

# 17. Shadow language

Shadows are:

* Large
* Soft
* Diffuse
* Low opacity
* Dark rather than colored

Avoid obvious Material Design-style shadows.

Better:

```css
box-shadow:
  0 20px 50px rgba(0,0,0,0.35);
```

rather than a sharp small shadow.

For gold elements, a very subtle warm glow can be introduced.

---

# 18. Corner language

The design uses **moderately rounded corners**.

Not:

* Sharp corporate rectangles
* Extremely rounded playful cards

The intended feeling is:

**soft + sophisticated + engineered**

Use a consistent radius family, roughly:

* Small controls: `8–10px`
* Cards/surfaces: `12–16px`
* Major containers: `16–20px`
* Pills: fully rounded

---

# 19. Glass / translucency

Some surfaces have a subtle glass-like quality.

Important distinction:

This is **not heavy glassmorphism**.

Instead:

* Dark translucent surface
* Very subtle background blending
* Soft border
* Slight blur where useful
* Strong dark opacity

The design should remain predominantly **solid dark fintech UI**, with only hints of glass.

---

# 20. Brand personality

The resulting visual personality can be summarized as:

> **Luxury + Trust + Wealth + Technology + Precision**

Not:

* playful
* colorful SaaS
* generic banking
* crypto-neon
* futuristic cyberpunk

It should communicate:

**"This is serious financial infrastructure for valuable physical assets."**

---

# 21. Content/textual elements visible in the reference

Separating the **actual content** from the visual composition, the interface contains the following textual vocabulary.

### Branding/account context

* `Gauld`
* `Account: 81-1234567`
* `SGD`
* `En`
* `$7,593.04`

### Navigation terminology

* `Dashboard`
* `Wallet`
* `Trading`
* `Vault`
* `Collateral`
* `Protection`
* `Asset manager`
* `Passport`
* `Statement`
* `Profile`

### Trading terminology

* `Trading`
* `Buy or Sell Gold / Silver`
* `Select metal`
* `Gold`
* `Select currency`
* `SGD`
* `Balance`
* `MARKET OPEN`
* `Gold spot price:`
* `4,327.77 USD/oz`

### Order controls

* `Buy`
* `Sell`
* `Reset all`
* `Order type:`
* `Spot`
* `Limit`
* `Bar weight preference:`
* `1 kg`
* `100 g`
* `1 oz`
* `Premium:`
* `6 USD/oz (0.14%)`

### Quantity / investment

* `Quantity (kg)`
* `Investment Amount`
* `1.8`
* `Estimated: 114,327 USD (14%)`

### Transaction summary

* `Summary`
* `Total Weight:`
* `1.8 kg (882 oz)`
* `Spot Price:`
* `4,377.77 USD/oz`
* `Premium:`
* `6 USD/oz (0.14%)`
* `Total price:`
* `114,327.38 USD`

### Primary action

* `Invest now`

### Product disclaimer

The design also contains a small explanatory disclaimer communicating that the provider reserves the right to substitute a 1 kg bar with a combination of weights, with the final gold-bar equivalence being maintained.

### Market/chart terminology

* `Gold price (SGD / oz)`
* `1h`
* `1d`
* `1w`
* `1m`
* `6m`
* `1y`
* `Oz`
* `G`

The chart uses time-based price points and a live/current highlighted value.

---

# 22. Design tokens distilled

If you wanted to reproduce the **visual language** independently of the reference's composition, I'd define the core tokens roughly as:

```text
THEME
────────────────────────
Mode: Dark luxury fintech
Primary accent: Gold
Secondary accent: Warm yellow
Surface family: Charcoal / graphite
Text: Off-white → gray
Imagery: Photorealistic metallic gold
Lighting: Cinematic warm gold
Contrast: Very high
Density: Medium-high
Mood: Premium / precise / institutional
```

```text
COLOR
────────────────────────
Background      #101010
Surface         #181818
Elevated        #202020
Control         #252525

Text Primary    #F2F2F2
Text Secondary  #A5A5A5
Text Muted      #6F6F6F

Gold Deep       #C99600
Gold            #F5D21A
Gold Bright     #FFD92E
Gold Highlight  #FFE45C
```

```text
VISUAL RULES
────────────────────────
Dark surfaces dominate.
Gold is reserved for meaning.
White establishes hierarchy.
Gray provides supporting information.
Borders are nearly invisible.
Shadows are soft.
Gold has luminosity.
Metal imagery is photorealistic.
Charts are minimal.
Icons are thin and restrained.
Controls feel integrated rather than boxed.
```

### The key takeaway

The strongest defining characteristic isn't simply **"black + yellow."**

It's the combination of **deep graphite surfaces + restrained gold interaction states + cinematic gold illumination + realistic metallic imagery + quiet typography + extremely subtle elevation**.

That combination is what gives the reference its **premium digital-gold / private-wealth terminal** identity.



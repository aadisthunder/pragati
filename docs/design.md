# Pragati - Design System & UI Specification
*Cognitive Prism Identity • Velvet Violet (#7A22E8) & Midnight Indigo (#2E1D5E) • Frosted Glass Surfaces • Lucide Vector Icons*

---

## 1. Aesthetic Foundations & Official Brand Identity

Pragati combines **high-precision academic glassmorphism** with the refined visual language of **The Cognitive Prism** (Variation 1):
- **Official Brand Mark (`/logo.png`)**: Three freestanding, ascending matte isometric prisms in Velvet Violet & Midnight Indigo representing Pragati's three foundational pillars:
  1. **AI Instructor** (Inquiry & Socratic Tutoring)
  2. **Quizzes Arena** (Adaptive Assessment)
  3. **Student Analytics** (Telemetry & Cognitive Growth)
- **Canvas & Tone**: Crisp, clean light canvas (`#FAF8FD`) with frosted white glass panels (`rgba(255, 255, 255, 0.92)`), `12px` backdrop blur, and soft lavender edge reflections.
- **Display Typography**: **Plus Jakarta Sans** (weights 700 & 800) for punchy geometric headings and titles, with brand headlines rendered in **Midnight Indigo (`#2E1D5E`)**.
- **Body & Telemetry**: **Inter** (400, 500, 600) for high-clarity reading and UI controls; **JetBrains Mono** for dwell timers and countdown clocks.
- **Primary Interactive Color**: **Velvet Violet (`#7A22E8`)** with pill geometry (`rounded-full`) across all primary CTAs, active navigation items, and performance charts.
- **Strict Iconography**: Vector icons from `lucide-react`. Zero emojis anywhere in UI copy, buttons, badges, or headers.

---

## 2. Color Palette & Design Tokens

### A. Core Cognitive Prism Colors
| Token | Hex Value | Role |
|---|---|---|
| `prism-violet` | `#7A22E8` | Primary CTA, active nav pills, growth metrics |
| `prism-violet-dark` | `#6918C8` | Primary button hover state |
| `prism-violet-deep` | `#5A12B0` | Primary button active press |
| `prism-indigo` | `#2E1D5E` | Main page titles, header typography, dark accents |
| `prism-purple-mid` | `#521EA8` | Secondary visual accents |
| `prism-lavender` | `#F3ECFF` | Active pill background, selected option surface |
| `prism-lavender-border`| `#D8B4FE` | Active borders, subtle card highlight |
| `prism-canvas` | `#FAF8FD` | Global application background |

### B. Glass Surfaces
| Token | Value | Role |
|---|---|---|
| `glass-surface` | `rgba(255, 255, 255, 0.92)` | Translucent card surface |
| `glass-surface-hover` | `rgba(255, 255, 255, 0.98)` | Elevated card hover |
| `glass-border` | `rgba(226, 232, 240, 0.85)` | Structural card borders |
| `text-primary` | `#2E1D5E` (Midnight Indigo) | Titles, prominent headers |
| `text-body` | `#0F172A` (Slate-900) | Content text, prompt statements |
| `text-muted` | `#64748B` (Slate-500) | Secondary explanations, subtext |

---

## 3. Component Design Tokens

### A. Frosted Glass Container (`glass-card`)
```css
.glass-card {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 1.5rem; /* 24px */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -2px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.98);
  border-color: #D8B4FE;
  box-shadow: 0 10px 20px -3px rgba(122, 34, 232, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.02);
}
```

### B. Velvet Violet Action Button
```css
.btn-deezer-primary, .btn-prism-primary {
  background-color: #7A22E8;
  color: #FFFFFF;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.625rem 1.5rem;
  box-shadow: 0 4px 14px rgba(122, 34, 232, 0.28);
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-deezer-primary:hover, .btn-prism-primary:hover {
  background-color: #6918C8;
  box-shadow: 0 6px 18px rgba(122, 34, 232, 0.38);
  transform: translateY(-1px);
}
```

### C. Sidebar Navigation
- Fixed vertical bar: `w-64 bg-white/90 backdrop-blur-md border-r border-slate-200/85`.
- Brand Logo: `<img src="/logo.png" />` with `text-xl font-display font-extrabold text-[#2E1D5E]`.
- Exactly 3 navigation items:
  1. `Bot`: **AI Instructor** (`/instructor`)
  2. `CheckSquare`: **Quizzes** (`/quizzes`)
  3. `BarChart3`: **Analytics** (`/analytics`)
- Active state: Velvet pill (`bg-[#F3ECFF] text-[#7A22E8] border border-[#D8B4FE] font-bold rounded-xl`).

# Sonara Design System & Theme Styling Guide

This document contains the complete color palette, CSS design tokens, typography, component styles, animations, and Tailwind CSS configuration used in the Sonara platform. Use this guide to maintain consistent aesthetics across the extension and dashboard web app.

---

## 1. CSS Design Tokens (`:root`)

Add these CSS variables to your application's global stylesheet (e.g. `globals.css`, `styles.css`, or `index.css`):

```css
:root {
  /* Surface & Backgrounds */
  --bg: #0b0b0d;               /* Base application background (Deep Obsidian) */
  --bg-elevated: #141417;      /* Cards, Modals, Floating Panels */
  --bg-soft: #1b1b20;          /* Inputs, Inactive badges, Secondary containers */
  --bg-hover: #232329;         /* Hover states for cards & buttons */

  /* Borders */
  --border: rgba(255, 255, 255, 0.08);         /* Subtle standard border */
  --border-strong: rgba(255, 255, 255, 0.14);  /* Focused or highlighted borders */

  /* Typography Colors */
  --text: #f4f4f5;             /* Primary high-contrast text */
  --text-secondary: #a1a1aa;   /* Subtitles, secondary descriptions */
  --text-muted: #71717a;       /* Labels, placeholders, disabled text */

  /* Accent Colors (Violet / Purple) */
  --accent: #a78bfa;           /* Light accent text & badges */
  --accent-strong: #8b5cf6;    /* Primary button fill & focused outlines */
  --accent-soft: rgba(139, 92, 246, 0.16); /* Glows, soft badges */

  /* Status Colors */
  --success: #34d399;          /* Success feedback & badges */
  --error: #f87171;            /* Errors, destructive buttons */

  /* Typography & Layout */
  --font: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --radius: 12px;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
}
```

---

## 2. Color Palette Breakdown

| Role | Hex / RGBA | Description & Usage |
| :--- | :--- | :--- |
| **App Background** | `#0b0b0d` | Main page background (Deep dark theme base) |
| **Card / Surface** | `#141417` | Cards, sidebars, header bars, modals |
| **Input / Soft Surface** | `#1b1b20` | Input backgrounds, profile cards, secondary items |
| **Hover Surface** | `#232329` | Interactive element hover state |
| **Primary Accent** | `#8b5cf6` | Primary action buttons, active focus rings |
| **Accent Text** | `#a78bfa` | Highlighted text, subtle links, count badges |
| **Primary Text** | `#f4f4f5` | Main headings, primary titles |
| **Secondary Text** | `#a1a1aa` | Body copy, subtitles |
| **Muted Text** | `#71717a` | Captions, metadata, placeholders |
| **Subtle Border** | `rgba(255, 255, 255, 0.08)` | Card borders, dividers |
| **Strong Border** | `rgba(255, 255, 255, 0.14)` | Hover borders, active inputs, modal borders |

---

## 3. Ambient Background FX

To replicate the ambient background glow used on login and welcome screens:

```css
.dashboard-hero {
  background: 
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139, 92, 246, 0.12), transparent 60%),
    var(--bg);
}
```

---

## 4. Component Styles

### A. Primary Action Button (`.btn-primary`)
```css
.btn-primary {
  background: var(--accent-strong);
  color: #ffffff;
  border: none;
  border-radius: var(--radius);
  font-family: var(--font);
  font-weight: 600;
  font-size: 14px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s var(--ease), background 0.2s var(--ease), opacity 0.2s var(--ease);
}
.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}
.btn-primary:active:not(:disabled) {
  transform: scale(0.985);
}
.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
```

### B. Secondary / Social Button (e.g. Google Sign-In)
```css
.btn-secondary {
  width: 100%;
  background: var(--bg-soft);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  font-family: var(--font);
  font-weight: 600;
  font-size: 14px;
  padding: 11px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s var(--ease), border-color 0.2s var(--ease), transform 0.2s var(--ease);
}
.btn-secondary:hover {
  background: var(--bg-hover);
  border-color: rgba(255, 255, 255, 0.22);
}
.btn-secondary:active {
  transform: scale(0.985);
}
```

### C. Input Fields & Form Wrappers
```css
.input-wrap {
  position: relative;
}

input[type="text"],
input[type="email"],
input[type="password"] {
  width: 100%;
  background: var(--bg-soft);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 11px 12px 11px 40px;
  color: var(--text);
  font-size: 14px;
  font-family: var(--font);
  font-weight: 500;
  outline: none;
  transition: border-color 0.2s var(--ease), box-shadow 0.2s var(--ease);
}

input::placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

input:focus {
  border-color: var(--accent-strong);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
```

### D. Card & Surface Containers
```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  transition: background 0.2s var(--ease), border-color 0.2s var(--ease), transform 0.2s var(--ease);
}
.card:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}
```

### E. Glassmorphism Modal & Backdrop
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal {
  width: 100%;
  max-width: 420px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-strong);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.55);
}
```

### F. Badges & Dividers
```css
.badge {
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}

.divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 16px 0;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid var(--border);
}
.divider span {
  padding: 0 10px;
}
```

---

## 5. Animations & Micro-Interactions

```css
.fade-in { animation: fadeIn 0.4s var(--ease); }
.fade-in-up { animation: fadeInUp 0.3s var(--ease); }

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## 6. Tailwind CSS Config Equivalent

If your dashboard uses **Tailwind CSS**, add the tokens to `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0b0b0d',
          elevated: '#141417',
          soft: '#1b1b20',
          hover: '#232329',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          strong: 'rgba(255, 255, 255, 0.14)',
        },
        violet: {
          accent: '#a78bfa',
          strong: '#8b5cf6',
          soft: 'rgba(139, 92, 246, 0.16)',
        },
      },
      fontFamily: {
        sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        theme: '12px',
      },
    },
  },
}
```

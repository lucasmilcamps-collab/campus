# Design system

| file | what | edit? |
| --- | --- | --- |
| `tokens.json` | source of truth: colour roles (light + dark), effort scale, type, space, radius, shadow, motion, layout | yes |
| `build.py` | generates the four files below | — |
| `tokens.css` | CSS custom properties; `[data-theme]` works on any element | generated |
| `tailwind.preset.js` | Tailwind / NativeWind preset: `bg-surface text-muted p-4 rounded-md` | generated |
| `tokens.ts` | typed light/dark objects + `effortOf()` for React Native | generated |
| `tokens.dark.json` | dark palette + pairs, for the contrast check | generated |
| `contrast.py` | WCAG check, exits 1 on any AA failure | — |
| `components.md` | spec for every component: variants, states, tokens, a11y, screens | yes |
| `gallery.html` / `gallery.png` | every primitive in light and dark, using tokens only; the visual check | yes |

```bash
python3 replica/design/build.py
python3 replica/design/contrast.py replica/design/tokens.json
python3 replica/design/contrast.py replica/design/tokens.dark.json
```

The colours are neutral placeholders, not the original's brand colours. `/replica-brand` swaps the values; the role names stay.

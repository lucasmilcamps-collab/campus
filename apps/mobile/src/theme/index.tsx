import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, useColorScheme, type TextStyle, type ViewStyle } from 'react-native';
import { tokens, type ColorRole, type Effort, type SessionType } from './tokens';

export { tokens };
export type { ColorRole, Effort, SessionType };

type Scheme = 'light' | 'dark';
type TypeName = keyof typeof tokens.type;

export interface Theme {
  scheme: Scheme;
  c: Record<ColorRole, string>;
  /** space by index: sp(4) = 16 */
  sp: (i: number) => number;
  r: typeof tokens.radius;
  layout: typeof tokens.layout;
  type: (name: TypeName) => TextStyle;
  effort: (e: Effort) => { solid: string; soft: string; ink: string };
  focusRing: (focused: boolean) => ViewStyle;
}

const ThemeCtx = createContext<Theme | null>(null);

function build(scheme: Scheme): Theme {
  const c = tokens[scheme] as Record<ColorRole, string>;
  return {
    scheme,
    c,
    sp: (i) => tokens.space[i],
    r: tokens.radius,
    layout: tokens.layout,
    type: (name) => {
      const t = tokens.type[name];
      return { fontSize: t.size, lineHeight: t.line, fontWeight: String(t.weight) as TextStyle['fontWeight'] };
    },
    effort: (e) => ({
      solid: c[`effort-${e}` as ColorRole],
      soft: c[`effort-${e}-soft` as ColorRole],
      ink: c[`effort-${e}-ink` as ColorRole],
    }),
    focusRing: (focused) =>
      focused
        ? Platform.select<ViewStyle>({
            web: { outlineStyle: 'solid', outlineWidth: 2, outlineColor: c.focus, outlineOffset: 2 } as ViewStyle,
            default: { borderColor: c.focus },
          })!
        : {},
  };
}

export function ThemeProvider({ children, scheme }: { children: ReactNode; scheme?: Scheme }) {
  const system = useColorScheme();
  const s: Scheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const value = useMemo(() => build(s), [s]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error('useTheme outside ThemeProvider');
  return t;
}

export function effortOf(type: SessionType): Effort {
  return tokens.effort.session_type[type] as Effort;
}

export function effortOfZone(zone: string): Effort {
  return ((tokens.effort.pace_zone as Record<string, number>)[zone] ?? 1) as Effort;
}

/** Tabular figures for anything that updates or lines up. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** react-native-web only activates role="button" with the keyboard. Radios,
 *  tabs and other pressables get Enter/Space here (web only; no-op on native). */
export function keyActivate(onPress?: () => void): object {
  if (Platform.OS !== 'web' || !onPress) return {};
  return {
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPress();
      }
    },
  };
}

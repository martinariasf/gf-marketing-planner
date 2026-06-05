import {
  Briefcase,
  Users,
  MessageCircle,
  Shield,
  Share2,
  Palette,
  Calendar,
  BarChart3,
  Lightbulb,
  Images,
  Target,
  type LucideIcon,
} from 'lucide-react'

// ─── Systematic per-section accent palette ───────────────────────────────────
// One central, typed map from an app section to its accent (icon + Tailwind
// classes). This mirrors the per-type coding introduced on the Strategy page
// (ST2) so every section of the dashboard speaks the same visual language: a
// type-coloured icon chip + heading. Colours use existing Tailwind tokens only
// (brand-blue / brand-green plus the violet/amber/rose/teal/indigo families),
// so nothing new needs to be added to the theme.
//
// Strategy keeps its own finer-grained per-content-type map (positioning,
// pillars, …); this module is the page-level palette consumed by Company
// Context today and available to other pages going forward.

export type AppSection =
  | 'business'
  | 'audience'
  | 'voice'
  | 'boundaries'
  | 'channels'
  | 'branding'
  | 'strategy'
  | 'calendar'
  | 'performance'
  | 'learnings'
  | 'assets'

export interface SectionAccent {
  icon: LucideIcon
  /** left-border accent, e.g. on the icon chip */
  border: string
  /** subtle tinted background for the icon chip */
  bg: string
  /** icon colour */
  iconCls: string
  /** label / heading colour when an accented heading is wanted */
  labelCls: string
}

export const SECTION_ACCENT: Record<AppSection, SectionAccent> = {
  business: {
    icon: Briefcase,
    border: 'border-l-brand-blue',
    bg: 'bg-brand-blue-50/40',
    iconCls: 'text-brand-blue',
    labelCls: 'text-brand-blue',
  },
  audience: {
    icon: Users,
    border: 'border-l-brand-green-600',
    bg: 'bg-brand-green-100/40',
    iconCls: 'text-brand-green-600',
    labelCls: 'text-brand-green-600',
  },
  voice: {
    icon: MessageCircle,
    border: 'border-l-violet-400',
    bg: 'bg-violet-50/40',
    iconCls: 'text-violet-600',
    labelCls: 'text-violet-700',
  },
  boundaries: {
    icon: Shield,
    border: 'border-l-amber-400',
    bg: 'bg-amber-50/40',
    iconCls: 'text-amber-600',
    labelCls: 'text-amber-700',
  },
  channels: {
    icon: Share2,
    border: 'border-l-rose-400',
    bg: 'bg-rose-50/30',
    iconCls: 'text-rose-600',
    labelCls: 'text-rose-700',
  },
  branding: {
    icon: Palette,
    border: 'border-l-teal-400',
    bg: 'bg-teal-50/30',
    iconCls: 'text-teal-600',
    labelCls: 'text-teal-700',
  },
  // Page-level accents (available for future use / cross-page consistency).
  strategy: {
    icon: Target,
    border: 'border-l-brand-blue',
    bg: 'bg-brand-blue-50/40',
    iconCls: 'text-brand-blue',
    labelCls: 'text-brand-blue',
  },
  calendar: {
    icon: Calendar,
    border: 'border-l-indigo-400',
    bg: 'bg-indigo-50/40',
    iconCls: 'text-indigo-600',
    labelCls: 'text-indigo-700',
  },
  performance: {
    icon: BarChart3,
    border: 'border-l-brand-blue',
    bg: 'bg-brand-blue-50/40',
    iconCls: 'text-brand-blue',
    labelCls: 'text-brand-blue',
  },
  learnings: {
    icon: Lightbulb,
    border: 'border-l-amber-400',
    bg: 'bg-amber-50/40',
    iconCls: 'text-amber-600',
    labelCls: 'text-amber-700',
  },
  assets: {
    icon: Images,
    border: 'border-l-violet-400',
    bg: 'bg-violet-50/40',
    iconCls: 'text-violet-600',
    labelCls: 'text-violet-700',
  },
}

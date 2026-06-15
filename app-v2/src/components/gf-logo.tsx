import { cn } from '@/lib/utils'

interface Props {
  variant?: 'mark' | 'lockup'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: { mark: 'h-7',  text: 'text-[9px]'  },
  md: { mark: 'h-9',  text: 'text-[10px]' },
  lg: { mark: 'h-12', text: 'text-[11px]' },
}

/**
 * GF Innovative Solutions logo mark + optional wordmark.
 * Uses the brand PNG (`/gf-logo.png` — the navy + green "GF" mark). `w-auto`
 * keeps its aspect ratio; height is driven by the `size` prop.
 */
export function GFLogo({ variant = 'mark', size = 'md', className }: Props) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/gf-logo.png"
        alt="GF Innovative Solutions"
        className={cn(s.mark, 'w-auto select-none')}
        draggable={false}
      />
      {variant === 'lockup' && (
        <span className="flex flex-col leading-tight tracking-[0.18em] font-semibold text-brand-blue">
          <span className={s.text}>INNOVATIVE</span>
          <span className={s.text}>SOLUTIONS</span>
        </span>
      )}
    </span>
  )
}

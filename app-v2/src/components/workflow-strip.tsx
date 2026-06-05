import { motion } from 'framer-motion'
import { NavLink, useParams } from 'react-router'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export type WorkflowPhase = 'plan' | 'draft' | 'refine' | 'prepare' | 'learn'

const PHASES: Array<{
  key: WorkflowPhase
  /** Sub-route to land on when this phase is clicked. */
  to: string
}> = [
  { key: 'plan',    to: 'context' },
  { key: 'draft',   to: 'calendar' },
  { key: 'prepare', to: 'approvals' },
  { key: 'learn',   to: 'performance' },
]

interface Props {
  current?: WorkflowPhase
}

export function WorkflowStrip({ current = 'plan' }: Props) {
  const { slug } = useParams<{ slug: string }>()
  const t = useT()

  return (
    <div className="border-b border-border-subtle bg-paper">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          {PHASES.map((p, i) => {
            const active = p.key === current
            const href = slug ? `/${slug}/${p.to}` : `/${p.to}`
            return (
              <div key={p.key} className="flex items-center gap-2 shrink-0">
                <NavLink to={href} title={t(`workflow.${p.key}.hint`)} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue rounded-full">
                  <motion.div
                    initial={false}
                    animate={{
                      backgroundColor: active ? 'var(--color-brand-blue)' : 'transparent',
                      color: active ? '#ffffff' : 'var(--color-ink-muted)',
                    }}
                    transition={{ duration: 0.25 }}
                    className={cn(
                      'flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium cursor-pointer transition-shadow hover:shadow-sm',
                      !active && 'border border-border-subtle hover:border-brand-blue/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                        active ? 'bg-white/20 text-white' : 'bg-brand-blue-50 text-brand-blue',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span>{t(`workflow.${p.key}`)}</span>
                  </motion.div>
                </NavLink>
                {i < PHASES.length - 1 && (
                  <span className="text-ink-muted/40 text-xs">→</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

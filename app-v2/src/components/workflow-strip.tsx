import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type WorkflowPhase = 'plan' | 'draft' | 'refine' | 'prepare' | 'learn'

const PHASES: Array<{ key: WorkflowPhase; label: string; hint: string }> = [
  { key: 'plan',    label: 'Plan',    hint: 'Read strategy, priorities, and goals' },
  { key: 'draft',   label: 'Draft',   hint: 'Create content ideas and assets' },
  { key: 'refine',  label: 'Refine',  hint: 'Adjust based on human feedback' },
  { key: 'prepare', label: 'Prepare', hint: 'Package approved content' },
  { key: 'learn',   label: 'Learn',   hint: 'Review outcomes and store lessons' },
]

interface Props {
  current?: WorkflowPhase
}

export function WorkflowStrip({ current = 'plan' }: Props) {
  return (
    <div className="border-b border-border-subtle bg-paper">
      <div className="mx-auto max-w-7xl px-6 py-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {PHASES.map((p, i) => {
            const active = p.key === current
            return (
              <div key={p.key} className="flex items-center gap-2 shrink-0">
                <motion.div
                  initial={false}
                  animate={{
                    backgroundColor: active ? 'var(--color-brand-blue)' : 'transparent',
                    color: active ? '#ffffff' : 'var(--color-ink-muted)',
                  }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
                    !active && 'border border-border-subtle',
                  )}
                  title={p.hint}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                      active ? 'bg-white/20 text-white' : 'bg-brand-blue-50 text-brand-blue',
                    )}
                  >
                    {i + 1}
                  </span>
                  <span>{p.label}</span>
                </motion.div>
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

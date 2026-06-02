import { Languages, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n, SUPPORTED_LANGS } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LanguageSwitcher({ size = 'sm' }: { size?: 'sm' | 'icon' }) {
  const { lang, setLang, t } = useI18n()
  const current = SUPPORTED_LANGS.find((l) => l.code === lang) ?? SUPPORTED_LANGS[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={size === 'icon' ? 'icon' : 'sm'}
          className={cn('gap-1.5', size === 'icon' ? 'h-9 w-9' : 'h-9 px-2.5')}
          title={t('common.language')}
          aria-label={t('common.language')}
        >
          <Languages className="h-3.5 w-3.5" />
          {size !== 'icon' && (
            <span className="text-xs font-semibold tracking-wide">{current.short}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ink-muted">
          {t('common.language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className="text-sm flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-ink-muted w-6">{l.short}</span>
              <span>{l.label}</span>
            </span>
            {l.code === lang && <Check className="h-3.5 w-3.5 text-brand-blue" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

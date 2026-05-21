import { cn } from '@/lib/utils'

interface Props {
  name: string
  color?: string
  className?: string
}

export function Pillar({ name, color, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        className,
      )}
      style={{
        backgroundColor: (color ?? '#211D58') + '15',
        color: color ?? '#211D58',
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color ?? '#211D58' }}
      />
      {name}
    </span>
  )
}

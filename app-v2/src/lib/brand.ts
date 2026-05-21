export const BRAND = {
  blue: '#211D58',
  blueLight: '#5e5497',
  green: '#8BC07C',
  greenDark: '#4f8c45',
  ink: '#08060d',
  inkMuted: '#6b6375',
  paper: '#ffffff',
  paperMuted: '#f7f6f9',
  borderSubtle: '#e5e4e7',
} as const

export const PACE_COLORS: Record<'ahead' | 'on-track' | 'behind', string> = {
  ahead: '#4f8c45',
  'on-track': '#5e5497',
  behind: '#c2410c',
}

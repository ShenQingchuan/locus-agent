import { readFileSync } from 'node:fs'
import presetTypography from '@unocss/preset-typography'
import { defineConfig, presetIcons, presetWebFonts, presetWind4 } from 'unocss'

const moonshotSvg = readFileSync(new URL('./public/moonshot.svg', import.meta.url), 'utf-8')

export default defineConfig({
  content: {
    pipeline: {
      include: [
        'src/**/*.{vue,ts,tsx}',
        '../../packages/**/src/**/*.{vue,ts}',
      ],
    },
  },
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/',
      collections: {
        custom: {
          moonshot: moonshotSvg,
        },
      },
    }),
    presetTypography({
      cssExtend: {
        // 覆盖默认样式，使用 CSS 变量
        'a': {
          'color': 'hsl(var(--primary))',
          'text-decoration': 'underline',
          'text-underline-offset': '2px',
        },
        'a:hover': {
          opacity: '0.8',
        },
        'code': {
          'color': 'hsl(var(--foreground))',
          'background-color': 'hsl(var(--muted))',
          'padding': '0.125rem 0.25rem',
          'border-radius': '0.25rem',
          'font-size': '0.875em',
        },
        'code::before': {
          content: '""',
        },
        'code::after': {
          content: '""',
        },
        'pre': {
          'background-color': 'hsl(var(--muted))',
          'border': '1px solid hsl(var(--border))',
          'border-radius': '0.5rem',
        },
        'pre code': {
          'background-color': 'transparent',
          'padding': '0',
        },
        'blockquote': {
          'border-left-color': 'hsl(var(--border))',
          'color': 'hsl(var(--muted-foreground))',
        },
        'hr': {
          'border-color': 'hsl(var(--border))',
        },
        'h1, h2, h3, h4, h5, h6': {
          color: 'hsl(var(--foreground))',
        },
        'strong': {
          color: 'hsl(var(--foreground))',
        },
        'th': {
          'border-bottom-color': 'hsl(var(--border))',
        },
        'td': {
          'border-bottom-color': 'hsl(var(--border))',
        },
      },
    }),
    presetWebFonts({
      fonts: {
        sans: 'Archivo',
        mono: 'IBM Plex Mono',
      },
    }),
  ],
  theme: {
    colors: {
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      sidebar: {
        'DEFAULT': 'hsl(var(--sidebar-background))',
        'background': 'hsl(var(--sidebar-background))',
        'foreground': 'hsl(var(--sidebar-foreground))',
        'primary': 'hsl(var(--sidebar-primary))',
        'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
        'accent': 'hsl(var(--sidebar-accent))',
        'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
        'border': 'hsl(var(--sidebar-border))',
        'ring': 'hsl(var(--sidebar-ring))',
      },
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
  },
  shortcuts: {
    // Flex utilities
    'flex-center': 'flex items-center justify-center',
    'flex-col-center': 'flex flex-col items-center justify-center',

    // Button base - shadcn v2: no shadow, subtle transitions
    'btn-base': 'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:outline-none',

    // Button variants - shadcn official dark mode style
    // Primary: white bg + black text in dark mode (auto via CSS vars)
    'btn-primary': 'btn-base bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2',
    'btn-secondary': 'btn-base bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2',
    'btn-destructive': 'btn-base bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2',
    // Outline: transparent bg + subtle border + white text in dark mode
    'btn-outline': 'btn-base border border-input bg-transparent hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2',
    'btn-ghost': 'btn-base hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2',
    'btn-link': 'btn-base text-primary underline-offset-4 hover:underline h-10 px-4 py-2',

    // Button sizes
    'btn-sm': 'h-9 rounded-md px-3',
    'btn-lg': 'h-11 rounded-md px-8',
    'btn-icon': 'h-8 w-8 p-0',

    // Input - shadcn v2: subtle border, slightly brighter bg in dark mode
    // Using bg-transparent lets the muted background show through naturally
    'input-field': 'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:outline-none',

    // Textarea - shadcn v2: subtle border, focus uses ring
    'textarea-field': 'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:outline-none',

    // Card - shadcn v2: border-dominant, no shadow, extremely subtle border
    'card': 'rounded-lg border border-border bg-card text-card-foreground',
    'card-header': 'flex flex-col space-y-1.5 p-6',
    'card-title': 'text-2xl font-semibold leading-none tracking-tight',
    'card-description': 'text-sm text-muted-foreground',
    'card-content': 'p-6 pt-0',
    'card-footer': 'flex items-center p-6 pt-0',

    // Badge - shadcn v2 dark mode: transparent bg + subtle border + white text
    'badge': 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-150',
    'badge-default': 'badge border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
    'badge-secondary': 'badge border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
    'badge-destructive': 'badge border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90',
    // Outline badge: transparent bg + subtle border (perfect for dark mode tags)
    'badge-outline': 'badge bg-transparent text-foreground',

    // Separator
    'separator': 'shrink-0 bg-border',
    'separator-horizontal': 'separator h-[1px] w-full',
    'separator-vertical': 'separator h-full w-[1px]',

    // Avatar
    'avatar': 'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
    'avatar-image': 'aspect-square h-full w-full',
    'avatar-fallback': 'flex h-full w-full items-center justify-center rounded-full bg-muted',

    // Alert - shadcn v2: border-dominant, no shadow
    'alert': 'relative w-full border p-4 rounded-lg',
    'alert-destructive': 'alert border-destructive/30 text-destructive bg-destructive/5',

    // Tool call status styles - shadcn v2: more subtle, lower saturation
    'tool-pending': 'border-yellow-500/20 bg-yellow-500/5',
    'tool-awaiting': 'border-orange-500/20 bg-orange-500/5',
    'tool-completed': 'border-green-500/20 bg-green-500/5',
    'tool-error': 'border-destructive/20 bg-destructive/5',

    // Layout helpers
    'container-chat': 'mx-auto max-w-3xl',

    // Typography
    'text-muted': 'text-muted-foreground',
    'text-accent': 'text-accent-foreground',

    // Popover - shadcn v2: only popovers have subtle shadow
    'popover-content': 'rounded-lg border bg-popover text-popover-foreground shadow-md',
  },
})

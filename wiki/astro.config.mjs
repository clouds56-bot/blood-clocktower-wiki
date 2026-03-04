import { defineConfig } from 'astro/config';
import UnoCSS from '@unocss/astro';

// Supply `SITE_URL` and `BASE_PATH` from CI or environment when needed.
// Example (CI): SITE_URL="https://clouds56-bot.github.io" BASE_PATH="/blood-clocktower-wiki" pnpm --filter wiki run build
const site = process.env.SITE_URL || undefined;
const base = process.env.BASE_PATH || undefined;

export default defineConfig({
  output: 'static',
  integrations: [UnoCSS()],
  site,
  base,
});

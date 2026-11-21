// ESLint with the SonarJS rules (the JavaScript/TypeScript rules of SonarQube), for the local
// analysis without a server: npm run analyze (scripts/unix/analyze.sh, scripts\windows\analyze.bat).
// It extends the normal config, which `npm run lint` and the CI keep using unchanged. The SonarJS
// findings are warnings: they are reported in reports/eslint-sonar.json (listed by the analyze
// script) and never fail the analysis.
import sonarjs from 'eslint-plugin-sonarjs'
import { defineConfig, globalIgnores } from 'eslint/config'
import baseConfig from './eslint.config.js'

/** The level of a rule turned into a warning, keeping its options. */
const asWarning = (setting) => {
  const level = Array.isArray(setting) ? setting[0] : setting
  if (level === 'off' || level === 0) {
    return setting
  }
  return Array.isArray(setting) ? ['warn', ...setting.slice(1)] : 'warn'
}

const recommended = sonarjs.configs.recommended

export default defineConfig([
  ...baseConfig,
  globalIgnores(['reports']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: recommended.plugins,
    rules: Object.fromEntries(
      Object.entries(recommended.rules).map(([name, setting]) => [name, asWarning(setting)]),
    ),
  },
])

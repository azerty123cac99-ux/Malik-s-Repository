import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ConfigError from './components/ConfigError.tsx'
import { configProblems } from './lib/config.ts'

const root = createRoot(document.getElementById('root')!)
const problems = configProblems()

if (problems.length > 0) {
  root.render(<ConfigError problems={problems} />)
} else {
  // Load the app (and the Supabase client) only once the config is known to
  // be usable. Anything that still goes wrong at startup gets a visible error.
  Promise.all([import('./App.tsx'), import('./lib/auth.tsx')])
    .then(([{ default: App }, { AuthProvider }]) =>
      root.render(
        <StrictMode>
          <AuthProvider>
            <App />
          </AuthProvider>
        </StrictMode>,
      ),
    )
    .catch((e: unknown) => root.render(<ConfigError problems={[`The app failed to start: ${String(e)}`]} />))
}

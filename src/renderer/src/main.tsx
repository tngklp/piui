import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import App from './App'
import './styles/global.css'
import { applyStoredTheme, loadThemeId } from './theme/preference'

// Apply the theme before the first paint so there is no flash of the wrong palette.
applyStoredTheme(loadThemeId())

const container = document.getElementById('root')
if (!container) {
  throw new Error('PiUI root container (#root) was not found in index.html')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

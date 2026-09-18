import { EditorPage } from './pages/EditorPage';
import { LandingPage } from './landing/LandingPage';

export function App() {
  if (window.location.pathname === '/personalizar') {
    return <EditorPage />;
  }
  return <LandingPage />;
}

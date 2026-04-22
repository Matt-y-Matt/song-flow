import { getSession, onAuthChange } from './lib/auth.js';
import { renderLogin } from './views/login.js';
import { initEditor, teardownEditor } from './views/editor.js';

const app = document.getElementById('app');

let currentView = null; // 'login' | 'editor'

async function routeForSession(session) {
  if (session?.user) {
    if (currentView === 'editor') return;
    currentView = 'editor';
    await initEditor(session.user, app);
  } else {
    if (currentView === 'login') return;
    currentView = 'login';
    await teardownEditor();
    renderLogin(app);
  }
}

(async () => {
  const session = await getSession();
  await routeForSession(session);

  onAuthChange(async (_event, session) => {
    await routeForSession(session);
  });
})();

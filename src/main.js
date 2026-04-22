import { getSession, onAuthChange } from './lib/auth.js';
import { renderLogin } from './views/login.js';
import { initEditor, teardownEditor } from './views/editor.js';
import { initPublicView, teardownPublicView } from './views/public-view.js';

const app = document.getElementById('app');

let currentView = null; // 'login' | 'editor' | 'public'

function publicTokenFromPath() {
  const m = window.location.pathname.match(/^\/view\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function routeForSession(session) {
  const publicToken = publicTokenFromPath();
  if (publicToken) {
    if (currentView === 'public') return;
    currentView = 'public';
    await teardownEditor();
    await initPublicView(publicToken, app);
    return;
  }
  if (session?.user) {
    if (currentView === 'editor') return;
    currentView = 'editor';
    await teardownPublicView();
    await initEditor(session.user, app);
  } else {
    if (currentView === 'login') return;
    currentView = 'login';
    await teardownEditor();
    await teardownPublicView();
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

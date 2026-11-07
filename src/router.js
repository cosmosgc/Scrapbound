import Navigo from 'navigo';

const ROUTES = {
  '/factory': { view: 'factory', title: 'Factory floor' },
  '/brains': { view: 'brains', title: 'Brain lab' },
  '/expeditions': { view: 'expeditions', title: 'Expeditions' },
  '/community': { view: 'community', title: 'Community board' },
};

export function createAppRouter(onRoute) {
  const basePath = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const router = new Navigo(basePath || '/', { hash: false, linksSelector: 'a[data-route]' });
  document.querySelectorAll('a[data-route]').forEach(link => {
    const path = link.dataset.route;
    link.setAttribute('href', `${basePath}${path}` || '/');
    // Keep the fully-qualified subpath in href for direct links, but pass only
    // the route-relative path to Navigo so its root prefix is added once.
    link.setAttribute('data-navigo', 'false');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.target === '_blank') return;
      event.preventDefault();
      router.navigate(path);
    });
  });
  router.on('/', () => router.navigate('/factory', { historyAPIMethod: 'replaceState' }));
  for (const [path, route] of Object.entries(ROUTES)) {
    const activate = () => {
      document.title = `${route.title} — Scrapbound`;
      onRoute(route.view);
    };
    router.on(path, activate);
  }
  router.notFound(() => {
    document.title = 'Sector not found — Scrapbound';
    onRoute('not-found');
  });
  router.resolve();
  router.updatePageLinks();
  return router;
}

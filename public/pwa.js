// pwa.js — SkyluxMovies
// Mirrors AdvaySnapTik proven registration pattern:
// SW + Background Sync + Periodic Sync + install prompt capture
(function () {
  // ── Service Worker ──────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(async reg => {

          // ── Background Sync (retry failed fetches when back online)
          if ('SyncManager' in window) {
            try { await reg.sync.register('skylux-sync'); } catch {}
          }

          // ── Periodic Background Sync (refresh content daily)
          if ('periodicSync' in reg) {
            try {
              const status = await navigator.permissions.query({
                name: 'periodic-background-sync'
              });
              if (status.state === 'granted') {
                await reg.periodicSync.register('skylux-refresh', {
                  minInterval: 24 * 60 * 60 * 1000  // once per day
                });
              }
            } catch {}
          }

          // ── Listen for SW updates — reload tabs automatically
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                newSW.postMessage('skipWaiting');
              }
            });
          });

        })
        .catch(() => {});

      // Reload page when new SW takes over
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) { refreshing = true; location.reload(); }
      });
    });
  }

  // ── PWA Install prompt capture ───────────────────────────────────
  // Store the event so the app can trigger install at the right moment
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    // Expose globally so any button can trigger it
    window.__pwaInstall = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return outcome;
    };
    // Fire custom event so UI can show install button if desired
    window.dispatchEvent(new CustomEvent('pwaInstallReady'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });

})();

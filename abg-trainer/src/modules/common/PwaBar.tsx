import { useEffect, useState } from 'react';
import { isIos, isStandalone } from '../../pwa';
import { load, save } from '../../storage';
import { useT } from './useT';

type InstallEvent = Event & { prompt: () => Promise<unknown> };

/** Update notice, Android install button and the iPhone "Add to Home Screen" hint. */
export function PwaBar() {
  const { t } = useT();
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const onUpdate = (e: Event) => setWorker((e as CustomEvent<ServiceWorker>).detail);
    const onInstall = (e: Event) => {
      e.preventDefault();
      if (!load('pwaDismissed', false)) setInstall(e as InstallEvent);
    };
    window.addEventListener('pwa-update', onUpdate);
    window.addEventListener('beforeinstallprompt', onInstall);
    if (isIos() && !isStandalone() && /^https:$/.test(window.location.protocol) && !load('pwaDismissed', false)) setHint(true);
    return () => {
      window.removeEventListener('pwa-update', onUpdate);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, []);

  const dismiss = () => {
    save('pwaDismissed', true);
    setInstall(null);
    setHint(false);
  };

  if (!worker && !install && !hint) return null;
  return (
    <div className="pwa-bar" role="region" aria-label={t('pwa.label')} data-testid="pwa-bar">
      {worker && (
        <p>
          {t('pwa.update')}{' '}
          <button
            type="button"
            className="primary"
            onClick={() => {
              worker.addEventListener('statechange', () => worker.state === 'activated' && window.location.reload());
              worker.postMessage('skip-waiting');
              setTimeout(() => window.location.reload(), 1500);
            }}
            data-testid="pwa-update"
          >
            {t('pwa.updateNow')}
          </button>
        </p>
      )}
      {install && (
        <p>
          {t('pwa.install')}{' '}
          <button type="button" className="primary" onClick={() => { void install.prompt(); dismiss(); }} data-testid="pwa-install">{t('pwa.installNow')}</button>{' '}
          <button type="button" onClick={dismiss}>{t('pwa.later')}</button>
        </p>
      )}
      {hint && (
        <p data-testid="pwa-ios">
          {t('pwa.ios')} <button type="button" onClick={dismiss}>{t('pwa.gotIt')}</button>
        </p>
      )}
    </div>
  );
}

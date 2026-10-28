import { useEffect } from 'react';
import { LANGS, type Lang } from './i18n';
import { Calculator } from './modules/calculator/Calculator';
import { Exam } from './modules/exam/Exam';
import { Progress } from './modules/progress/Progress';
import { Reference } from './modules/reference/Reference';
import { Settings } from './modules/settings/Settings';
import { Verify } from './modules/settings/Verify';
import { Trainer } from './modules/trainer/Trainer';
import { useT } from './modules/common/useT';
import { useApp, type Screen } from './store';

const NAV: Screen[] = ['home', 'calculator', 'trainer', 'exam', 'reference', 'progress', 'settings'];

function Home() {
  const { t } = useT();
  const go = useApp((s) => s.go);
  return (
    <div>
      <p className="disclaimer" role="note" data-testid="disclaimer">{t('app.disclaimer')}</p>
      <p className="lead">{t('app.lead')}</p>
      <div className="modes">
        {(['calculator', 'trainer', 'exam'] as const).map((m) => (
          <button key={m} className="mode-card" onClick={() => go(m)} data-testid={'mode-' + m}>
            <strong>{t('mode.' + m)}</strong>
            <span>{t('mode.' + m + '.desc')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const { t } = useT();
  const { screen, go, lang, setLang, storageOk } = useApp();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t('app.title');
  }, [lang, t]);

  return (
    <>
      <a href="#main" className="skip">{t('app.skip')}</a>
      <header className="top">
        <div className="brand">
          <h1>{t('app.title')}</h1>
          <span className="muted small">{t('app.subtitle')}</span>
        </div>
        <label className="lang">
          <span className="sr-only">{t('app.language')}</span>
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} data-testid="lang">
            {LANGS.map((l) => <option key={l} value={l}>{t('lang.' + l)}</option>)}
          </select>
        </label>
        <nav aria-label={t('nav.label')}>
          <ul>
            {NAV.map((s) => (
              <li key={s}>
                <button className={screen === s ? 'active' : ''} aria-current={screen === s ? 'page' : undefined} onClick={() => go(s)} data-testid={'nav-' + s}>
                  {t('nav.' + s)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {!storageOk && <p className="flag flag-warning storage-warning" role="alert">{t('app.noStorage')}</p>}
      <main id="main" tabIndex={-1}>
        {screen === 'home' && <Home />}
        {screen === 'calculator' && <Calculator />}
        {screen === 'trainer' && <Trainer />}
        {screen === 'exam' && <Exam />}
        {screen === 'reference' && <Reference />}
        {screen === 'progress' && <Progress />}
        {screen === 'settings' && <Settings />}
        {screen === 'verify' && <Verify />}
      </main>
      <footer className="muted small">{t('app.footer')}</footer>
    </>
  );
}

import { useEffect, useState } from 'react';
import { motion, sceneIds, sceneNames } from './content';
import { Wheel } from './components/Wheel';
import { Intro, Organizations, Statistics } from './components/Scenes';
import { Exhibition } from './components/Exhibition';
import { projects } from 'virtual:archive-projects';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useSceneNavigation } from './hooks/useSceneNavigation';

export function App() {
  const mobile = useMediaQuery('(max-width: 63.99rem)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { active, transitioning, finishEntry, scrollRef, goTo, onKeyDown } = useSceneNavigation(reducedMotion);
  const [entering, setEntering] = useState(active === 0);

  useEffect(() => {
    if (!entering) return;
    if (active !== 0 || reducedMotion) { setEntering(false); return; }
    const timer = window.setTimeout(() => setEntering(false), motion.entryDuration);
    return () => window.clearTimeout(timer);
  }, [active, entering, reducedMotion]);

  return <>
    {active !== 3 && !transitioning && <a className="skip-link" href="#exhibition" onClick={(event) => { event.preventDefault(); goTo(3, true, true); }}>전시회로 바로가기</a>}
    <div ref={scrollRef} className="experience" role={active === 3 ? undefined : 'main'} tabIndex={active === 3 ? -1 : 0} aria-label={active === 3 ? undefined : 'AI 우왕톤 아카이브'}
      aria-describedby={active === 3 ? undefined : 'navigation-help'} onKeyDown={onKeyDown} data-scene={sceneIds[active]}
      data-reduced-motion={reducedMotion} data-transitioning={transitioning} aria-busy={transitioning}>
      {active !== 3 && <p className="sr-only" id="navigation-help">스크롤하거나 위아래 방향키로 소개 장면을 이동합니다. Tab 키로 이전·다음 버튼에 접근할 수 있습니다. 전시회에 입장하면 소개로 돌아가지 않습니다.</p>}
      <div className="runway">
        {sceneIds.map((id, index) => <div className="snap-marker" key={id} aria-hidden="true" style={{ top: `${index * 100}svh` }} />)}
        <div className="viewport">
          <div className="splash-surface" hidden={active === 3} inert={transitioning} aria-hidden={transitioning || undefined}>
            <Wheel active={active} entering={entering} mobile={mobile} />
            {[<Intro />, <Organizations />, <Statistics projectCount={projects.length} />].map((scene, index) => (
              <section key={index} className={`scene scene-${index}`} id={`scene-${sceneIds[index]}`}
                aria-labelledby={sceneIds[index]} hidden={active !== index}>
                {scene}
              </section>
            ))}
          </div>
          <div className="scene scene-3" id="scene-exhibition"
            hidden={active !== 3 && !transitioning} inert={active !== 3} aria-hidden={active !== 3 || undefined}
            onAnimationEnd={event => { if (event.target === event.currentTarget && event.animationName === 'gallery-enter') finishEntry(); }}>
            <Exhibition projects={projects} active={active === 3} entering={transitioning} reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
    </div>
    {active !== 3 && !transitioning && <nav className="keyboard-navigation" aria-label="장면 이동">
      <button type="button" aria-disabled={active === 0} onClick={() => goTo(active - 1)}>이전 장면</button>
      <button type="button" onClick={() => goTo(active + 1, true)}>다음 장면</button>
    </nav>}
    {active !== 3 && <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{active + 1} / 4 · {sceneNames[active]}</span>}
  </>;
}

import type { CSSProperties } from 'react';
import ai from '../assets/wordmark-ai.svg';
import woowang from '../assets/wordmark-woowang.svg';
import thon from '../assets/wordmark-thon.svg';
import { organizations, statistics } from '../content';

export function Intro() {
  return <div className="intro-content content">
    <h1 className="sr-only" id="intro" tabIndex={-1}>AI 우왕톤</h1>
    <div className="wordmark" aria-hidden="true">
      {[ai, woowang, thon].map((src, i) => <div className={`logo-row logo-row-${i}`} key={src}>
        <img className="reveal" src={src} alt="" style={{ '--row': i } as CSSProperties} />
      </div>)}
    </div>
  </div>;
}

export function Organizations() {
  return <div className="organizations-content content">
    <h2 className="sr-only" id="organizations" tabIndex={-1}>주관·주최·후원</h2>
    {organizations.map((group, index) => <div className={`organization-mask organization-mask-${index}`} key={group.role}>
      <section className={`organization-row organization-row-${index} reveal`} style={{ '--row': index } as CSSProperties}
        aria-labelledby={`organization-role-${index}`}>
        <h3 id={`organization-role-${index}`}>{group.role}</h3>
        <ul>{group.items.map((org) => <li key={org.id} className={`org-${org.id}`}>
          <img src={org.src} alt={org.name} />
        </li>)}</ul>
      </section>
    </div>)}
  </div>;
}

export function Statistics({ projectCount }: { projectCount: number }) {
  return <div className="statistics-content content">
    <div className="title-mask"><h2 className="reveal" id="statistics" tabIndex={-1} style={{ '--row': 0 } as CSSProperties}>숫자로 보는 우왕톤</h2></div>
    <dl className="statistics">
      {statistics.map((stat, index) => <div className="stat" key={stat.label} style={{ '--item-row': index + 1 } as CSSProperties}>
          <dt className="stat-label-mask"><span className="stat-label">{stat.label}</span></dt>
          <dd className="stat-value-mask"><span className="stat-value">
            <span className="stat-number">{stat.value ?? projectCount}</span><span className="stat-unit">{stat.unit}</span>
          </span></dd>
      </div>)}
    </dl>
  </div>;
}

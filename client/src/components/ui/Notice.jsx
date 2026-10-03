/**
 * Notice — 안내 줄. tone: neutral | info | outline | review | success | muted | warning | danger.
 * flush: 화면 폭 줄(아래 선만). 위아래로 쌓지 말고 한 화면에 한 줄을 원칙으로 쓴다.
 */
import './ui.css'

export default function Notice({ tone = 'neutral', icon: Icon, title, children, actions, flush = false, className = '', ...rest }) {
  const cls = ['ui-notice', `ui-tone-${tone}`, flush ? 'ui-notice--flush' : '', className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {Icon && <Icon className="ui-notice__icon" aria-hidden="true" size={18} strokeWidth={2} />}
      <div className="ui-notice__text">
        {title && <strong className="ui-notice__title">{title}</strong>}
        {children && <div className="ui-notice__body">{children}</div>}
      </div>
      {actions && <div className="ui-notice__actions">{actions}</div>}
    </div>
  )
}

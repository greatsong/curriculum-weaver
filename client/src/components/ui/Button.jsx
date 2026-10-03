/**
 * Button — 공용 버튼. variant: primary | secondary | ghost | link, size: md(44px) | sm(36px).
 * to를 주면 라우터 링크, href를 주면 일반 링크로 그린다(모양은 같다). 호버는 ui.css가 맡는다.
 * 링크가 비활성이면 클릭되지 않는 button으로 그린다(키보드 초점에서 빠지고 이유는 title로).
 */
import { Link } from 'react-router-dom'
import './ui.css'

export default function Button({
  variant = 'secondary', size = 'md', block = false, icon: Icon, iconRight: IconRight,
  to, href, type = 'button', className = '', children, disabled, ...rest
}) {
  const cls = ['ui-btn', `ui-btn--${variant}`, `ui-btn--${size}`, block ? 'ui-btn--block' : '', className].filter(Boolean).join(' ')
  const iconSize = size === 'sm' ? 14 : 16
  const content = (
    <>
      {Icon && <Icon aria-hidden="true" size={iconSize} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight aria-hidden="true" size={iconSize} strokeWidth={2} />}
    </>
  )
  if (to && !disabled) return <Link to={to} className={cls} {...rest}>{content}</Link>
  if (href && !disabled) return <a href={href} className={cls} {...rest}>{content}</a>
  return <button type={type} className={cls} disabled={disabled} {...rest}>{content}</button>
}

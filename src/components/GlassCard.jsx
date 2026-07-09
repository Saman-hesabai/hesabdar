import { ChevronDown } from 'lucide-react'

export default function GlassCard({ title, sub, icon: Icon, open, onToggle, children }) {
  return (
    <section className={`glass ${open ? 'open' : ''}`}>
      <button className="glass-head" onClick={onToggle}>
        <span className="icon">{Icon ? <Icon size={28} /> : null}</span>
        <span>
          <b>{title}</b>
          <small>{sub}</small>
        </span>
        <ChevronDown className={open ? 'rot' : ''} />
      </button>

      {open && <div className="glass-body">{children}</div>}
    </section>
  )
}

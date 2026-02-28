import { Users } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'

const COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
  { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-400' },
  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-400' },
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
  { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-400' },
]

export default function MemberList() {
  const members = useSessionStore((s) => s.members)

  if (members.length === 0) {
    return (
      <div className="flex items-center gap-1 text-gray-400">
        <Users size={14} />
        <span className="text-xs">0</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Users size={14} className="text-gray-400 shrink-0" />
      <div className="flex items-center gap-1 overflow-hidden">
        {members.map((member, i) => {
          const color = COLORS[i % COLORS.length]
          return (
            <div
              key={member.socketId}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${color.bg} shrink-0`}
              title={member.name}
            >
              <div className={`w-2 h-2 rounded-full ${color.dot}`} />
              <span className={`text-xs font-medium ${color.text} max-w-[4rem] truncate`}>
                {member.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

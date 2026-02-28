import { Users } from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'

const COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-green-100', text: 'text-green-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
]

export default function MemberList() {
  const members = useSessionStore((s) => s.members)

  return (
    <div className="flex items-center gap-1">
      <Users size={14} className="text-gray-400" />
      <div className="flex -space-x-2">
        {members.length === 0 ? (
          <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-400">
            ?
          </div>
        ) : (
          members.map((member, i) => {
            const color = COLORS[i % COLORS.length]
            return (
              <div
                key={member.socketId}
                className={`w-7 h-7 rounded-full ${color.bg} border-2 border-white flex items-center justify-center text-xs font-medium ${color.text}`}
                title={member.name}
              >
                {member.name?.slice(0, 1) || '?'}
              </div>
            )
          })
        )}
      </div>
      <span className="text-xs text-gray-400 ml-1">{members.length || 0}</span>
    </div>
  )
}

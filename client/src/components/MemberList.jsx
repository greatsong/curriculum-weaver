import { Users } from 'lucide-react'

// 테스트 모드: Supabase Presence 대신 정적 표시
export default function MemberList() {
  return (
    <div className="flex items-center gap-1">
      <Users size={14} className="text-gray-400" />
      <div className="flex -space-x-2">
        <div className="w-7 h-7 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xs font-medium text-blue-700">
          교
        </div>
      </div>
      <span className="text-xs text-gray-400 ml-1">1</span>
    </div>
  )
}

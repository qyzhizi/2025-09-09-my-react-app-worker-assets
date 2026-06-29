import { useState } from 'react'
import LogInput from './LogInput'
import LogList from './LogList'
import LogEditModal from './LogEditModal'
import { apiFetch } from '@/common'

interface LogItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

const Logs = () => {
  const [refreshFlag, setRefreshFlag] = useState(0)
  const [editingLog, setEditingLog] = useState<LogItem | null>(null)

  const handleLogSubmitted = () => {
    setRefreshFlag((prev) => prev + 1)
  }

  const handleEdit = (log: LogItem) => {
    setEditingLog(log)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该条日志？')) return
    try {
      const res = await apiFetch(`/api/diary-log/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      setRefreshFlag((prev) => prev + 1)
    } catch (err) {
      console.error(err)
      alert('删除失败，请重试')
    }
  }

  return (
    <div
      className="h-fit max-w-4xl mb-2 relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700"
      tabIndex={0}
    >
      <LogInput onLogSubmitted={handleLogSubmitted} />
      <LogList
        refreshFlag={refreshFlag}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* 编辑浮层 */}
      {editingLog && (
        <LogEditModal
          log={editingLog}
          onClose={() => setEditingLog(null)}
          onSaved={() => setRefreshFlag((prev) => prev + 1)}
        />
      )}
    </div>
  )
}

export default Logs
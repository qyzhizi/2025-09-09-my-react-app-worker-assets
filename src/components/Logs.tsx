import { useState } from 'react'
import LogInput from './LogInput'
import LogList from './LogList'

const Logs = () => {
  const [refreshFlag, setRefreshFlag] = useState(0)

  const handleLogSubmitted = () => {
    setRefreshFlag((prev) => prev + 1)
  }

  return (
    <div className="h-fit max-w-4xl mb-2 relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800  border-gray-200 dark:border-zinc-700 "
      tabIndex={0}>
      <LogInput onLogSubmitted={handleLogSubmitted} />
      <LogList refreshFlag={refreshFlag} />
    </div>
  )
}

export default Logs
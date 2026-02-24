// InitRefreshToken.tsx
import { useEffect } from 'react';
import { apiFetch } from '@/common';
import { navigate } from '@/Routers'

// init-refresh-token
export async function initRefreshToken() {
  await apiFetch("/api/init-refresh-token", {
    method: "GET",
  });
} 

export function InitRefreshToken() {
    useEffect(() => {
    const run = async () => {
        try {
        await initRefreshToken()
        } finally {
        // Whether successful or not, jump immediately.
        navigate('/', { replace: true })
        }
    }

    run()
    }, [])

    return (
        <div className="w-full flex justify-center">
            <div className="flex h-screen flex-col items-center gap-4" style={{ paddingTop: '25vh' }}>
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
                <div className="text-xl font-medium">
                    Signing you in…
                </div>
            </div>
        </div>
    )

}

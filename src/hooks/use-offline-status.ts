import { useEffect, useState } from 'react';

import { readNavigatorOnline } from 'src/auth/offline-status';

export function useOfflineStatus(): { isOffline: boolean } {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return !readNavigatorOnline(navigator.onLine);
  });

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    setIsOffline(!readNavigatorOnline(navigator.onLine));

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOffline };
}
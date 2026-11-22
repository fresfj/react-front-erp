import { useState, useEffect, useCallback } from 'react';

// ----------------------------------------------------------------------

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type UsePwaInstallReturn = {
  /** True quando o navegador disparou beforeinstallprompt (Chrome/Edge Desktop & Android). */
  canPrompt: boolean;
  /** True quando está em Safari iOS (onde a instalação é via botão Compartilhar). */
  isIosSafari: boolean;
  /** True quando já está rodando como app instalado (standalone). */
  isInstalled: boolean;
  /** True quando podemos mostrar o botão "Instalar App" (prompt nativo ou guia iOS). */
  canShowInstall: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
};

export function usePwaInstall(): UsePwaInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });

  const isIosSafari = (() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isWebkit = /WebKit/.test(ua);
    const isOtherBrowser = /CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
    return isIos && isWebkit && !isOtherBrowser;
  })();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  const canPrompt = Boolean(deferredPrompt) && !isInstalled;
  const canShowInstall = !isInstalled && (canPrompt || isIosSafari);

  return {
    canPrompt,
    isIosSafari,
    isInstalled,
    canShowInstall,
    promptInstall,
  };
}

import { api } from "@/convex/_generated/api.js";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const SECRET_KEY = "push-subscription-secret";

type NotificationStatus =
  | "unsupported"
  | "iframe"
  | "denied"
  | "loading"
  | "subscribed"
  | "unsubscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function usePushNotifications(isAuthenticated?: boolean) {
  const [secret, setSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const getVapidPublicKey = useAction(api.pushNotifications.getVapidPublicKey);
  const registerSubscription = useAction(api.pushNotifications.subscribe);
  const identifySubscription = useAction(api.pushNotifications.identify);
  const removeSubscription = useAction(api.pushNotifications.unsubscribe);
  const hasIdentified = useRef(false);

  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
    const stored = localStorage.getItem(SECRET_KEY);
    if (stored) setSecret(stored);
  }, []);

  const status: NotificationStatus = useMemo(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
    if (isInIframe()) return "iframe";
    if (permission === "denied") return "denied";
    if (isLoading) return "loading";
    if (secret !== null) return "subscribed";
    return "unsubscribed";
  }, [permission, isLoading, secret]);

  const subscribe = useCallback(async () => {
    if (status === "unsupported" || status === "iframe" || status === "denied") return;

    setIsLoading(true);
    try {
      const { vapidPublicKey } = await getVapidPublicKey();
      if (!vapidPublicKey) return;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const { secret: newSecret } = await registerSubscription({
        subscription: JSON.stringify(subscription),
      });

      localStorage.setItem(SECRET_KEY, newSecret);
      setSecret(newSecret);
    } catch (error) {
      toast.error("Benachrichtigungen konnten nicht aktiviert werden.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [status, getVapidPublicKey, registerSubscription]);

  const identify = useCallback(async () => {
    const currentSecret = secret ?? localStorage.getItem(SECRET_KEY);
    if (!currentSecret) return;
    try {
      await identifySubscription({ secret: currentSecret });
    } catch (error) {
      console.error(error);
    }
  }, [secret, identifySubscription]);

  useEffect(() => {
    if (isAuthenticated && !hasIdentified.current && secret) {
      hasIdentified.current = true;
      void identify();
    }
    if (!isAuthenticated) hasIdentified.current = false;
  }, [isAuthenticated, secret, identify]);

  const unsubscribe = useCallback(async () => {
    const currentSecret = secret ?? localStorage.getItem(SECRET_KEY);
    if (!currentSecret) return;

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();

      await removeSubscription({ secret: currentSecret });
      localStorage.removeItem(SECRET_KEY);
      setSecret(null);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [secret, removeSubscription]);

  return { status, subscribe, identify, unsubscribe };
}

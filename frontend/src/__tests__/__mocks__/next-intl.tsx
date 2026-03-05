import React from 'react';

export function useTranslations(namespace?: string) {
  return function t(key: string, values?: Record<string, unknown>) {
    // Return the key with namespace stripped, simulating real translation
    // For simple keys, return a readable English version
    let result = key;
    if (values) {
      Object.entries(values).forEach(([k, v]) => {
        result = result.replace(`{${k}}`, String(v));
      });
    }
    return result;
  };
}

export function useLocale() {
  return 'en';
}

export function useMessages() {
  return {};
}

export function useNow() {
  return new Date();
}

export function useTimeZone() {
  return 'UTC';
}

export function useFormatter() {
  return {
    number: (v: number) => String(v),
    dateTime: (v: Date) => v.toISOString(),
    relativeTime: (v: Date) => v.toISOString(),
  };
}

export function NextIntlClientProvider({
  children,
}: {
  children: React.ReactNode;
  locale?: string;
  messages?: Record<string, unknown>;
}) {
  return <>{children}</>;
}

export function IntlProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

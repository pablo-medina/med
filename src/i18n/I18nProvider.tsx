import { useEffect, type ReactNode } from "react";
import { initializeI18n } from "./index";

export interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  useEffect(() => {
    void initializeI18n();
  }, []);

  return children;
}

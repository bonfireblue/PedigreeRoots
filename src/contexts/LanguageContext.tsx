"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, Language, Translations } from "@/lib/translations";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  // Auto-detect Vietnam timezone on mount and check localStorage
  useEffect(() => {
    // Check localStorage first
    const savedLang = localStorage.getItem("pedigree-lang") as Language | null;
    if (savedLang && (savedLang === "en" || savedLang === "vi")) {
      setLangState(savedLang);
      return;
    }

    // Auto-detect Vietnam timezone
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === "Asia/Ho_Chi_Minh" || tz === "Asia/Saigon") {
        setLangState("vi");
        localStorage.setItem("pedigree-lang", "vi");
      }
    } catch {
      // Ignore timezone detection errors
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem("pedigree-lang", newLang);
  };

  const t = translations[lang];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Language toggle component with toggle switch style
export function LanguageToggle({ style }: { style?: React.CSSProperties }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#f1f5f9",
        borderRadius: 20,
        padding: 4,
        ...style,
      }}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: lang === "en" ? "#ffffff" : "transparent",
          border: "none",
          borderRadius: 16,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          color: lang === "en" ? "#111827" : "#6b7280",
          boxShadow: lang === "en" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        <span style={{ fontSize: 14 }}>🇺🇸</span>
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("vi")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: lang === "vi" ? "#ffffff" : "transparent",
          border: "none",
          borderRadius: 16,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          color: lang === "vi" ? "#111827" : "#6b7280",
          boxShadow: lang === "vi" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          transition: "all 0.2s ease",
        }}
      >
        <span style={{ fontSize: 14 }}>🇻🇳</span>
        VI
      </button>
    </div>
  );
}

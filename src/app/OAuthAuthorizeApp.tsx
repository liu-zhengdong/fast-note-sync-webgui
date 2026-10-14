import "@/styles/auth.css";

import {
  authorizeStart,
  authorizeSubmit,
  buildOAuthAuthorizeRequest,
  getMissingOAuthAuthorizeFields,
  type OAuthAuthorizeStartResponse,
} from "@/components/oauth/oauth-authorize";
import { AuthForm } from "@/components/user/auth-form";
import { AnimatedBackground } from "@/components/user/animated-background";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/context/theme-context";
import { toast } from "@/components/common/Toast";
import i18n, { ensureResourceLoaded } from "@/i18n/translations";
import { Github, Moon, ShieldCheck, Sun, SunMoon, Wifi } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type OAuthAuthorizeState = "checking" | "login" | "consent" | "error";

function getToken() {
  return localStorage.getItem("token") || "";
}

export function OAuthAuthorizeApp() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const request = useMemo(
    () => buildOAuthAuthorizeRequest(new URLSearchParams(window.location.search)),
    [],
  );
  const [state, setState] = useState<OAuthAuthorizeState>("checking");
  const [error, setError] = useState("");
  const [authorizeData, setAuthorizeData] = useState<OAuthAuthorizeStartResponse | null>(null);
  const [localeReady, setLocaleReady] = useState(false);
  const missingFields = useMemo(() => getMissingOAuthAuthorizeFields(request), [request]);

  const startAuthorization = useCallback(async () => {
    if (missingFields.length > 0) {
      setError(`Missing OAuth parameters: ${missingFields.join(", ")}`);
      setState("error");
      return;
    }

    const token = getToken();
    if (!token) {
      setError("");
      setState("login");
      return;
    }

    try {
      setError("");
      setState("checking");
      const data = await authorizeStart(request, token);
      if (!data.consent_required) {
        const submitData = await authorizeSubmit(request, token, true);
        window.location.href = submitData.redirect_uri;
        return;
      }
      setAuthorizeData(data);
      setState("consent");
    } catch (err) {
      localStorage.removeItem("token");
      setError(err instanceof Error ? err.message : "OAuth authorization failed");
      setState("login");
    }
  }, [missingFields, request]);

  const submitAuthorization = async (consentGranted: boolean) => {
    try {
      setError("");
      const token = getToken();
      const data = await authorizeSubmit(request, token, consentGranted);
      window.location.href = data.redirect_uri;
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth authorization failed";
      setError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    void startAuthorization();
  }, [startAuthorization]);

  useEffect(() => {
    let mounted = true;
    const lang = i18n.language;
    ensureResourceLoaded(lang).then(() => {
      void i18n.changeLanguage(lang);
      if (mounted) {
        setLocaleReady(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (state === "login" && localeReady) {
    return (
      <AuthForm
        onSuccess={() => {
          void startAuthorization();
        }}
        registerIsEnable={false}
      />
    );
  }

  const clientName = authorizeData?.client?.client_name || "This application";
  const scopes = authorizeData?.scope_results || [];

  return (
    <div className={`auth-page-container ${resolvedTheme}`}>
      <div className="auth-background-layer">
        <AnimatedBackground />
      </div>

      <div className="auth-floating-actions">
        <button
          onClick={() => window.open("https://github.com/liu-zhengdong/fast-note-sync-service", "_blank", "noopener,noreferrer")}
          className="auth-floating-switcher"
          title="Source Code"
        >
          <Github size={18} />
        </button>
        <button
          onClick={() => {
            if (theme === "light") setTheme("dark");
            else if (theme === "dark") setTheme("auto");
            else setTheme("light");
          }}
          className="auth-floating-switcher"
          title="Toggle Theme"
        >
          {theme === "auto" ? <SunMoon size={18} /> : resolvedTheme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <LanguageSwitcher showText={false} className="auth-floating-switcher" />
      </div>

      <main className="relative z-50 w-full px-6 py-12 flex flex-col items-center">
        <div className="auth-logo-wrapper">
          <div className="auth-logo-box">
            <Wifi size={40} className="auth-logo-icon" />
          </div>
          <h1 className="auth-title">Fast Note Sync</h1>
          <p className="auth-subtitle">
            {state === "checking" ? "Preparing OAuth authorization." : "Review the requested access."}
          </p>
        </div>

        <div className="auth-card oauth-card">
          {state === "checking" ? (
            <div className="oauth-status">
              <div className="oauth-spinner" />
              <span>Contacting authorization server...</span>
            </div>
          ) : null}

          {state === "consent" ? (
            <>
              <div className="oauth-client">
                <ShieldCheck className="size-5" />
                <div>
                  <h2>{clientName}</h2>
                  <p>is requesting access to your Fast Note Sync account.</p>
                </div>
              </div>

              <ul className="oauth-scope-list">
                {scopes.map((scope) => (
                  <li key={scope.scope}>
                    <span>{scope.scope}</span>
                    {scope.description ? <p>{scope.description}</p> : null}
                  </li>
                ))}
              </ul>

              <div className="oauth-actions">
                <Button onClick={() => void submitAuthorization(true)}>Authorize</Button>
                <Button variant="outline" onClick={() => void submitAuthorization(false)}>Deny</Button>
              </div>
            </>
          ) : null}

          {state === "error" ? <p className="oauth-error">{error}</p> : null}
          {error && state !== "error" ? <p className="oauth-error">{error}</p> : null}
        </div>
      </main>
    </div>
  );
}

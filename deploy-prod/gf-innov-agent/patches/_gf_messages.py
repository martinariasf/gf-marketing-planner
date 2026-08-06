# [GF-100] Shared ES/DE/EN copy for the two localized-error patches
# (patch_localized_errors.py, patch_truncation_reply.py). Kept in one place so
# the strings exist exactly once and both patches stay in sync with each other
# and with the dashboard's deploy-staging/api/src/agentMessages.ts catalog
# (same tone, same keys where they overlap: quota_exhausted, rate_limited,
# run_failed/provider_failed, output_truncated).
#
# This file is copied into the image at /opt/hermes/agent/_gf_messages.py by
# the Dockerfile, alongside the two patch scripts that import it.
from __future__ import annotations

SUPPORTED_LANGS = ("es", "de", "en")
DEFAULT_LANG = "en"

# key -> {lang: text}. Plain language, no tool names / codes / tracebacks —
# mirrors the "no technical jargon" rule in agentMessages.ts.
GF_MESSAGES: dict[str, dict[str, str]] = {
    "quota_exhausted": {
        "es": "Has alcanzado el límite de uso de hoy. Los créditos se renuevan a medianoche — ¡hablamos mañana!",
        "de": "Du hast das heutige Nutzungslimit erreicht. Das Guthaben wird um Mitternacht zurückgesetzt — bis morgen!",
        "en": "You've reached today's usage limit. Credits renew at midnight — talk tomorrow!",
    },
    "rate_limited": {
        "es": "Estoy recibiendo muchas peticiones a la vez. Espera un momento y vuelve a intentarlo.",
        "de": "Es kommen gerade zu viele Anfragen gleichzeitig. Bitte einen Moment warten und erneut versuchen.",
        "en": "I'm getting a lot of requests at once. Give it a moment and try again.",
    },
    "auth_failed": {
        "es": "Hubo un problema de autenticación con el proveedor. Avisa a Martin para revisar las credenciales.",
        "de": "Es gab ein Authentifizierungsproblem beim Anbieter. Bitte Martin informieren, um die Zugangsdaten zu prüfen.",
        "en": "There was an authentication problem with the provider. Let Martin know to check the credentials.",
    },
    "policy_rejected": {
        "es": "El proveedor del modelo rechazó la solicitud. Intenta reformular el mensaje.",
        "de": "Der Modellanbieter hat die Anfrage abgelehnt. Versuch es mit einer anderen Formulierung.",
        "en": "The model provider rejected the request. Try rephrasing your message.",
    },
    "provider_failed": {
        "es": "El proveedor del modelo falló tras varios intentos. Vuelve a intentarlo en un momento.",
        "de": "Der Modellanbieter ist nach mehreren Versuchen fehlgeschlagen. Bitte versuche es gleich noch einmal.",
        "en": "The model provider failed after retries. Please try again in a moment.",
    },
    "output_truncated": {
        "es": "La respuesta se hizo demasiado larga y no pude terminarla. Pídemelo por partes más pequeñas.",
        "de": "Die Antwort wurde zu lang und ich konnte sie nicht fertigstellen. Bitte frag mich in kleineren Teilen.",
        "en": "The response got too long and I couldn't finish it. Try asking me in smaller parts.",
    },
    "context_too_large": {
        "es": "La sesión se hizo demasiado grande para el modelo. Usa /compact para resumirla, o /reset para empezar de nuevo.",
        "de": "Die Sitzung ist zu groß für das Modell geworden. Nutze /compact zum Zusammenfassen oder /reset für einen Neustart.",
        "en": "The session got too large for the model's context window. Use /compact to compress it, or /reset to start fresh.",
    },
    "request_failed_prefix": {
        # Prefix only — the raw (truncated) error detail is appended after this,
        # same as the English original. Kept short and technical-detail-free.
        "es": "La solicitud falló",
        "de": "Die Anfrage ist fehlgeschlagen",
        "en": "The request failed",
    },
    "request_failed_suffix": {
        "es": "Vuelve a intentarlo o usa /reset para empezar una sesión nueva.",
        "de": "Versuche es erneut oder nutze /reset für eine neue Sitzung.",
        "en": "Try again or use /reset to start a fresh session.",
    },
    "processing_stopped_prefix": {
        "es": "Se detuvo el procesamiento",
        "de": "Die Verarbeitung wurde gestoppt",
        "en": "Processing stopped",
    },
    "processing_stopped_suffix": {
        "es": "Vuelve a intentarlo.",
        "de": "Bitte versuche es erneut.",
        "en": "Try again.",
    },
    "no_response_generated": {
        "es": "El procesamiento terminó pero no se generó ninguna respuesta. Puede ser un error transitorio — intenta enviar tu mensaje de nuevo.",
        "de": "Die Verarbeitung wurde abgeschlossen, aber es wurde keine Antwort erzeugt. Das kann ein vorübergehender Fehler sein — versuche, deine Nachricht erneut zu senden.",
        "en": "Processing completed but no response was generated. This may be a transient error — try sending your message again.",
    },
}


def render(key: str, lang: str | None) -> str:
    """Render a GF_MESSAGES key in the given language, falling back to en."""
    row = GF_MESSAGES.get(key) or GF_MESSAGES["provider_failed"]
    normalized = (lang or DEFAULT_LANG).strip().lower()
    if normalized not in SUPPORTED_LANGS:
        normalized = DEFAULT_LANG
    return row.get(normalized) or row[DEFAULT_LANG]


def resolve_gf_lang() -> str:
    """Resolve the current display language to one GF_MESSAGES supports.

    Reuses Hermes' own config resolution (agent.i18n.get_language(), which
    reads HERMES_LANGUAGE then config.yaml's display.language) so this stays
    in sync with whatever language the box is actually configured for,
    instead of re-implementing config lookup here.
    """
    try:
        from agent.i18n import get_language  # local import: keep this module import-safe standalone

        lang = (get_language() or DEFAULT_LANG).strip().lower()
    except Exception:
        lang = DEFAULT_LANG
    return lang if lang in SUPPORTED_LANGS else DEFAULT_LANG

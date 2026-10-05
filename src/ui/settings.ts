import { settingsPanel, settingsBtn } from "./dom";
function openSettings(): void {
    settingsPanel.classList.add("open");

    settingsPanel.setAttribute(
        "aria-hidden",
        "false"
    );

    settingsBtn.setAttribute(
        "aria-expanded",
        "true"
    );
}

export function closeSettings(): void {
    settingsPanel.classList.remove("open");

    settingsPanel.setAttribute(
        "aria-hidden",
        "true"
    );

    settingsBtn.setAttribute(
        "aria-expanded",
        "false"
    );
}

export function toggleSettings(): void {
    if (settingsPanel.classList.contains("open")) {
        closeSettings();
    } else {
        openSettings();
    }
}


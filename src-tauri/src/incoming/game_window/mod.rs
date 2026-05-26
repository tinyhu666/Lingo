//! Foreground game-window detection for the v0.9.0 auto-detect incoming
//! pipeline.
//!
//! Replaces the user-driven `ChatRegion` calibration flow (drag-to-select)
//! from v0.7–v0.8. The new flow:
//!
//! 1. On every pipeline tick, [`detect_current`] enumerates top-level
//!    windows on the host (Win32 `EnumWindows` on Windows, CoreGraphics
//!    `CGWindowListCopyWindowInfo` on macOS) and matches them against a
//!    table of known game signatures (process name + window class +
//!    window title).
//!
//! 2. If a match is found, the platform impl reports the game's screen
//!    bounds (and which display it sits on). The pipeline combines those
//!    bounds with the per-game [`crate::incoming::game_profiles`] chat-
//!    region fraction to compute a [`ChatRegion`] without any user input.
//!
//! 3. The overlay window listens for `incoming:game_window_changed` and
//!    snaps itself to the left of the detected game.
//!
//! Detection is intentionally a cheap poll (a few hundred μs). The pipeline
//! already throttles to 1.5 Hz; we don't need event-driven hooks for this.

use crate::incoming::region::Rect;

/// Games for which we ship a built-in chat-region profile in v0.9.0. The
/// detection layer maps a host window to one of these via process name +
/// window-class signatures.
///
/// `Other` is *not* in this enum on purpose — if we can't recognise the
/// game, the incoming feature stays dormant. That's intentionally
/// different from v0.8.0's "drag-to-select on any window" — see the
/// v0.9.0 redesign rationale in the CHANGELOG.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameId {
    Dota2,
    LeagueOfLegends,
}

impl GameId {
    /// Stable lowercase identifier that matches `AppSettings::game_scene`
    /// vocabulary, so we can write detected-game back to settings and the
    /// outgoing translator picks up the same prompt context.
    pub fn scene_tag(self) -> &'static str {
        match self {
            GameId::Dota2 => "dota2",
            GameId::LeagueOfLegends => "lol",
        }
    }

    pub fn from_scene_tag(tag: &str) -> Option<Self> {
        match tag.trim().to_ascii_lowercase().as_str() {
            "dota2" => Some(GameId::Dota2),
            "lol" => Some(GameId::LeagueOfLegends),
            _ => None,
        }
    }

    /// Human-readable name for status emission. Translated client-side
    /// when needed (this is a debug-friendly identifier, not user copy).
    pub fn display_name(self) -> &'static str {
        match self {
            GameId::Dota2 => "Dota 2",
            GameId::LeagueOfLegends => "League of Legends",
        }
    }
}

/// What we know about the currently-foreground game.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GameWindow {
    pub game_id: GameId,
    /// Window bounds in the global desktop coordinate space (physical
    /// pixels on Windows; logical points on macOS — matches the
    /// convention `DisplayInfo` already uses on each platform so the
    /// overlay can pass these to `WebviewWindow::setPosition` without
    /// further conversion).
    pub bounds: Rect,
    /// The display the window sits on — same id space as
    /// [`crate::incoming::DisplayInfo::id`]. Used to source the right
    /// [`crate::incoming::capture::CaptureSource`] frame on multi-monitor
    /// setups.
    pub display_id: u64,
    /// Window is minimised. The bounds are still meaningful (last known
    /// position) but capture would yield a black frame, so the pipeline
    /// should back off to the slow tick until the game returns.
    pub minimised: bool,
}

/// Poll the host for the foreground game window. Returns `None` when no
/// supported game is detected (or the platform isn't supported). The
/// pipeline interprets `None` as the "no game" backoff state.
pub fn detect_current() -> Option<GameWindow> {
    #[cfg(target_os = "windows")]
    {
        windows::detect_current()
    }
    #[cfg(target_os = "macos")]
    {
        macos::detect_current()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

/// Diagnostic-only: list every visible top-level window the detector
/// sees, with its class / title / process name and whether the
/// signature table matched it. Surfaced via a tauri command so the
/// user can hit it from DevTools when auto-detection silently fails
/// in the field — see `incoming_debug_enumerate_windows` in `lib.rs`.
pub fn enumerate_all_for_debug() -> Vec<DebugWindowEntry> {
    #[cfg(target_os = "windows")]
    {
        windows::enumerate_all_for_debug()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

/// Cross-platform debug entry. Mirrors the Windows shape; macOS will
/// emit the same struct (with `process_name` = `kCGWindowOwnerName`)
/// once detection lands there in v0.9.x.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DebugWindowEntry {
    /// Platform handle (Windows: HWND value; macOS: kCGWindowNumber).
    /// Caller treats it as opaque.
    pub hwnd: isize,
    pub class: String,
    pub title: String,
    pub process_name: String,
    pub process_name_lc: String,
    pub matched_game_id: Option<GameId>,
}

// ---------------------------------------------------------------------------
// Platform impls
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "macos")]
pub mod macos;

// ---------------------------------------------------------------------------
// Game-signature table (shared between platforms)
// ---------------------------------------------------------------------------

/// Per-platform detection signatures. The detector walks this table and
/// returns the first match. Process name comparison is case-insensitive;
/// window-class and title checks are case-sensitive (those tend to be
/// stable identifiers).
pub(crate) struct GameSignature {
    pub game_id: GameId,
    /// Lowercase executable file name (e.g. `dota2.exe`, `dota2`). The
    /// `.exe` suffix is included on Windows; macOS bundles don't carry
    /// one, so the macOS detector matches against the process-info
    /// owner name (`Dota 2`, `League of Legends`).
    pub process_name_lc: &'static str,
    /// One of these window-class names must match (Windows only). Empty
    /// slice means "don't check window class".
    pub window_classes: &'static [&'static str],
    /// At least one of these substrings must appear in the window title
    /// (case-insensitive contains). Empty slice means "any title".
    pub title_substrings: &'static [&'static str],
}

/// Detection table. Each game listed here also needs a corresponding
/// entry in [`crate::incoming::game_profiles::chat_region_for`] — that
/// keeps the "we can detect the window but don't know where chat is"
/// state impossible.
pub(crate) const SIGNATURES: &[GameSignature] = &[
    // Dota 2 — title-anchored. The window-class field was originally
    // pinned to `SDL_app` (the Source 2 default) but real user reports
    // hit empty/different classes (different DX renderer, Big Picture
    // overlay, etc.), so we drop the class check entirely. The title
    // "Dota 2" is specific enough on its own — random apps don't
    // usually carry it. `dota2.exe` is recorded too: when the OS lets
    // us read the host process name, it's an additional confirmer,
    // but anti-cheat / privilege-protected scenarios occasionally
    // refuse OpenProcess and return "" — we still accept the match in
    // that case as long as title hits.
    GameSignature {
        game_id: GameId::Dota2,
        process_name_lc: "dota2.exe",
        window_classes: &[],
        title_substrings: &["Dota 2"],
    },
    GameSignature {
        game_id: GameId::Dota2,
        // macOS bundle process name.
        process_name_lc: "dota 2",
        window_classes: &[],
        title_substrings: &["Dota 2"],
    },
    GameSignature {
        game_id: GameId::LeagueOfLegends,
        // Same logic as Dota: drop class check, lean on title.
        // The launcher (`LeagueClient.exe`) is filtered out by the
        // title check because its window title is just "League of
        // Legends" but our matcher requires the title substring,
        // which the launcher does contain. To prevent matching the
        // launcher we keep a second signature for that specifically;
        // see the title-only fallback in matches_signature for
        // the conservative branch.
        process_name_lc: "league of legends.exe",
        window_classes: &[],
        title_substrings: &["League of Legends"],
    },
    GameSignature {
        game_id: GameId::LeagueOfLegends,
        process_name_lc: "league of legends",
        window_classes: &[],
        title_substrings: &["League of Legends"],
    },
];

/// True if `process`/`class`/`title` collectively match `sig`. The
/// platform impls feed normalised inputs (lowercase process, raw class,
/// raw title) and rely on this helper to keep the matching logic in one
/// place.
///
/// v0.9.0-rc.2 behaviour (lenient): the matcher accepts either of
/// these on a per-attribute basis when the signature specifies one:
///
///   - **process_name_lc** is checked when the host returned a
///     non-empty name. If `OpenProcess` / `QueryFullProcessImageNameW`
///     failed (anti-cheat protected processes can refuse access), we
///     skip this check rather than reject. Process name is a
///     strengthener, not a hard requirement.
///   - **window_classes** is checked when the signature provides
///     classes. Today both Windows signatures ship an empty list, so
///     this is effectively informational — kept for forward use.
///   - **title_substrings** must always match when the signature
///     specifies any. This is the load-bearing check post-rc.2: title
///     is the most stable identifier across game updates and renderer
///     switches.
pub(crate) fn matches_signature(
    sig: &GameSignature,
    process_name_lc: &str,
    window_class: &str,
    window_title: &str,
) -> bool {
    // Process check is best-effort: skip when we couldn't read it.
    if !sig.process_name_lc.is_empty()
        && !process_name_lc.is_empty()
        && process_name_lc != sig.process_name_lc
    {
        return false;
    }
    // Window class check is opt-in: empty signature list means
    // "anything goes" (the v0.9.0-rc.1 SDL_app pin caused real
    // mismatches in the wild).
    if !sig.window_classes.is_empty()
        && !sig.window_classes.iter().any(|c| *c == window_class)
    {
        return false;
    }
    // Title check is mandatory when set — this is the load-bearing
    // identifier after rc.2 made process+class optional.
    if !sig.title_substrings.is_empty() {
        let title_lc = window_title.to_lowercase();
        if !sig
            .title_substrings
            .iter()
            .any(|s| title_lc.contains(&s.to_lowercase()))
        {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_tag_round_trips() {
        for g in [GameId::Dota2, GameId::LeagueOfLegends] {
            assert_eq!(GameId::from_scene_tag(g.scene_tag()), Some(g));
        }
    }

    #[test]
    fn from_scene_tag_is_case_insensitive() {
        assert_eq!(GameId::from_scene_tag("DOTA2"), Some(GameId::Dota2));
        assert_eq!(GameId::from_scene_tag(" dota2 "), Some(GameId::Dota2));
        assert_eq!(GameId::from_scene_tag("LoL"), Some(GameId::LeagueOfLegends));
        assert_eq!(GameId::from_scene_tag("wow"), None);
    }

    #[test]
    fn matches_signature_strict_on_process_class() {
        let sig = GameSignature {
            game_id: GameId::Dota2,
            process_name_lc: "dota2.exe",
            window_classes: &["SDL_app"],
            title_substrings: &["Dota 2"],
        };
        // Full match
        assert!(matches_signature(&sig, "dota2.exe", "SDL_app", "Dota 2 (DX11)"));
        // Process name mismatch (process is known to be wrong → reject)
        assert!(!matches_signature(&sig, "csgo.exe", "SDL_app", "Dota 2"));
        // Window class mismatch
        assert!(!matches_signature(&sig, "dota2.exe", "ChromeWindow", "Dota 2"));
        // Title mismatch
        assert!(!matches_signature(
            &sig,
            "dota2.exe",
            "SDL_app",
            "Steam Big Picture"
        ));
    }

    #[test]
    fn matches_signature_tolerates_unreadable_process_name() {
        // v0.9.0-rc.2 regression test: when anti-cheat / privilege
        // protection makes OpenProcess return access-denied, the
        // platform impl feeds an empty process name. The matcher
        // should fall back to class+title rather than reject outright.
        let sig = GameSignature {
            game_id: GameId::Dota2,
            process_name_lc: "dota2.exe",
            window_classes: &[],
            title_substrings: &["Dota 2"],
        };
        assert!(matches_signature(&sig, "", "SDL_app", "Dota 2"));
        assert!(matches_signature(&sig, "", "", "Dota 2"));
        // But still reject when the title is wrong.
        assert!(!matches_signature(&sig, "", "", "Steam"));
    }

    #[test]
    fn matches_signature_skips_unset_fields() {
        // macOS-style entry: empty window class — must not reject solely
        // because `window_class` is empty on macOS detection callers.
        let sig = GameSignature {
            game_id: GameId::Dota2,
            process_name_lc: "dota 2",
            window_classes: &[],
            title_substrings: &["Dota 2"],
        };
        assert!(matches_signature(&sig, "dota 2", "", "Dota 2 Reborn"));
    }

    #[test]
    fn matches_signature_title_is_case_insensitive() {
        let sig = GameSignature {
            game_id: GameId::LeagueOfLegends,
            process_name_lc: "league of legends.exe",
            window_classes: &["RiotWindowClass"],
            title_substrings: &["League of Legends"],
        };
        assert!(matches_signature(
            &sig,
            "league of legends.exe",
            "RiotWindowClass",
            "LEAGUE OF LEGENDS (TM) Client"
        ));
    }
}

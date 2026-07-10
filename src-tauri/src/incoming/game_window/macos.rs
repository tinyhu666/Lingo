//! macOS game-window detection — **stub for v0.9.0**, full implementation
//! tracked as a v0.9.x follow-up.
//!
//! The Windows side of the v0.9.0 redesign ships first because the
//! user was actively unblocked on Windows. The macOS path needs
//! `CGWindowListCopyWindowInfo` to recover the host game's window
//! bounds; that's not exposed by `objc2-core-graphics` without the
//! `CGWindow` cargo feature, which our Cargo.toml deliberately leaves
//! off (it would hard-link `CGPreflightScreenCaptureAccess` /
//! `CGRequestScreenCaptureAccess` symbols that don't exist before
//! macOS 10.15 and break the 10.13 floor).
//!
//! Resolution path for v0.9.x:
//! 1. Declare `CGWindowListCopyWindowInfo` directly as `extern "C"`
//!    against the already-linked CoreGraphics framework (the symbol
//!    has been present since 10.5 — only the permission-access ones
//!    are 10.15+, so we can hard-link `CGWindowListCopyWindowInfo`
//!    without bumping the deployment target).
//! 2. Walk the returned `CFArray<CFDictionary>` via objc2-core-foundation,
//!    extracting `kCGWindowOwnerName` (process) and `kCGWindowBounds`
//!    (frame). Match against `super::SIGNATURES`.
//! 3. Map the window's screen origin to a `CGDirectDisplayID` via
//!    `CGDisplayForRect` so `GameWindow.display_id` lands in the same
//!    id space `capture/macos.rs::list_displays` already uses.
//!
//! Until that lands, returning `None` keeps the pipeline in its
//! "no_game_detected" backoff state on macOS — exactly the same
//! behaviour the user gets when the game isn't running. The
//! drag-to-select calibration UI is still wired up on macOS in
//! parallel, so users have an escape hatch until v0.9.x.

use super::GameWindow;

pub fn detect_current() -> Option<GameWindow> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_returns_none() {
        assert!(detect_current().is_none());
    }
}

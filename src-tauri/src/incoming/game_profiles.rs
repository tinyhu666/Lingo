//! Per-game chat-region profiles for the v0.9.0 auto-detect pipeline.
//!
//! Each profile expresses the chat panel as a fractional rectangle of
//! the game window (origin top-left, range 0.0..=1.0). At runtime
//! `pipeline.rs` multiplies these fractions against the detected game
//! window's pixel bounds to produce an absolute [`ChatRegion`] without
//! asking the user to drag a box.
//!
//! Tuning rule of thumb: **err generous, not tight**. The downstream
//! `LineTracker` dedupes by text + position so an oversized capture
//! costs nothing; an undersized one drops messages we care about. Spike
//! B already measured `Windows.Media.Ocr` at <10 ms on rectangles up to
//! 1500 × 200 px, so we have plenty of latency budget for wider crops.
//!
//! The fractions below were derived from the screenshots in
//! `spikes/ocr-vision/samples/dota2/` (2940×1912 native retina) plus
//! published chat-panel screenshots. After v0.9.0 ships we expect to
//! iterate per game based on user reports.

use crate::incoming::game_window::GameId;
use crate::incoming::region::Rect;

/// Chat-region fraction. `x..x+w` and `y..y+h` are both in 0.0..=1.0 of
/// the game window dimensions. Constructed via [`Self::clamp_to_pixels`].
#[derive(Debug, Clone, Copy)]
pub struct ChatRegionProfile {
    pub x_frac: f32,
    pub y_frac: f32,
    pub w_frac: f32,
    pub h_frac: f32,
}

impl ChatRegionProfile {
    /// Materialise this profile against a concrete window-bounds rect
    /// (in physical pixels on Windows, logical points on macOS — same
    /// convention as the platform [`crate::incoming::DisplayInfo`]
    /// uses). The result is in the *global desktop coordinate space*,
    /// matching what `CaptureSource::capture` expects.
    ///
    /// The output is clamped into the window so a slightly-out-of-range
    /// profile (e.g. our fractions ask for `y=0.95..1.05`) doesn't
    /// generate a region the capture impl rejects.
    pub fn clamp_to_pixels(self, window: Rect) -> Rect {
        let wf = window.w as f32;
        let hf = window.h as f32;
        let x_abs = window.x as f32 + self.x_frac * wf;
        let y_abs = window.y as f32 + self.y_frac * hf;
        let w_abs = (self.w_frac * wf).max(1.0);
        let h_abs = (self.h_frac * hf).max(1.0);

        // Clamp against the window's right/bottom edge.
        let max_right = window.x as f32 + wf;
        let max_bottom = window.y as f32 + hf;
        let right = (x_abs + w_abs).min(max_right);
        let bottom = (y_abs + h_abs).min(max_bottom);
        let x = x_abs.max(window.x as f32);
        let y = y_abs.max(window.y as f32);
        let w = (right - x).max(0.0);
        let h = (bottom - y).max(0.0);

        Rect {
            x: x.round() as i32,
            y: y.round() as i32,
            w: w.round() as u32,
            h: h.round() as u32,
        }
    }
}

/// Lookup the chat-region profile for a game. Always returns a profile
/// — if we wired the game into [`crate::incoming::game_window::SIGNATURES`]
/// we owe a profile for it too. (`game_window` detection only returns
/// `GameId`s that have an entry here, so this match is exhaustive by
/// construction.)
pub fn chat_region_for(game: GameId, window: Rect) -> Rect {
    profile_for(game).clamp_to_pixels(window)
}

fn profile_for(game: GameId) -> ChatRegionProfile {
    match game {
        // DotA 2: the floating chat-line notification appears at
        // roughly y = 67..78% from top, x = 7..75% from left at native
        // 2940×1912 (see spikes/ocr-vision/samples/dota2/*). Generous
        // bounds: y = 65..82, x = 4..78. Width includes the [scope]
        // tag + player avatar + message column.
        GameId::Dota2 => ChatRegionProfile {
            x_frac: 0.04,
            y_frac: 0.65,
            w_frac: 0.74,
            h_frac: 0.17,
        },
        // League of Legends: in-game chat history floats from the
        // bottom-left during play. Riot's chat panel anchors at the
        // bottom-left corner with chat history scrolling up. Approx
        // y = 75..92, x = 0..30 at 1920×1080 reference. These
        // fractions are an educated guess; v0.9.x will tune from user
        // reports.
        GameId::LeagueOfLegends => ChatRegionProfile {
            x_frac: 0.00,
            y_frac: 0.75,
            w_frac: 0.32,
            h_frac: 0.17,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(x: i32, y: i32, w: u32, h: u32) -> Rect {
        Rect { x, y, w, h }
    }

    #[test]
    fn dota_profile_lands_inside_window_at_1080p() {
        let w = window(0, 0, 1920, 1080);
        let r = chat_region_for(GameId::Dota2, w);
        // Within 1px tolerance for f32 rounding.
        assert!(r.x >= 0 && (r.x as u32) + r.w <= 1920, "{r:?}");
        assert!(r.y >= 0 && (r.y as u32) + r.h <= 1080, "{r:?}");
        // Plausible size — at 1920×1080 the chat band should be
        // ~1420 wide × ~184 tall.
        assert!(r.w > 1000 && r.w < 1700);
        assert!(r.h > 100 && r.h < 300);
    }

    #[test]
    fn dota_profile_lands_inside_window_at_retina() {
        // The spike corpus dimensions.
        let w = window(0, 0, 2940, 1912);
        let r = chat_region_for(GameId::Dota2, w);
        assert!(r.x >= 0 && (r.x as u32) + r.w <= 2940);
        assert!(r.y >= 0 && (r.y as u32) + r.h <= 1912);
    }

    #[test]
    fn lol_profile_anchors_at_bottom_left() {
        let w = window(0, 0, 1920, 1080);
        let r = chat_region_for(GameId::LeagueOfLegends, w);
        // Bottom-left anchor — x should start near 0, y should be in
        // the lower 75% of the window.
        assert!(r.x < 50, "expected bottom-left anchor, got x={}", r.x);
        assert!(r.y >= 800, "expected lower portion, got y={}", r.y);
    }

    #[test]
    fn region_respects_window_origin() {
        // Non-zero window origin (game windowed on second monitor at
        // x=2560, or non-fullscreen at x=120).
        let w = window(2560, 100, 1920, 1080);
        let r = chat_region_for(GameId::Dota2, w);
        // Region's absolute x must be >= window's x, not start at 0.
        assert!(r.x >= 2560, "{r:?}");
        // And within the window.
        assert!((r.x as u32) + r.w <= 2560 + 1920);
    }

    #[test]
    fn region_clamps_overflow_safely() {
        // A pathologically tiny window — the fractional profile would
        // produce a sub-pixel rect. We should never panic and should
        // produce w/h >= 1.
        let w = window(0, 0, 5, 5);
        let r = chat_region_for(GameId::Dota2, w);
        assert!(r.w >= 1 && r.h >= 1);
    }
}

//! Display + region geometry for the incoming-chat pipeline.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) struct SurfaceRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Convert a global rectangle into a surface-local crop and clip it to the
/// surface bounds. Returns `None` when the rectangle does not intersect the
/// surface at all.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn clamp_rect_to_surface(
    rect: Rect,
    surface_origin_x: i32,
    surface_origin_y: i32,
    surface_w: u32,
    surface_h: u32,
) -> Option<SurfaceRect> {
    if rect.w == 0 || rect.h == 0 || surface_w == 0 || surface_h == 0 {
        return None;
    }

    let left = rect.x as i64 - surface_origin_x as i64;
    let top = rect.y as i64 - surface_origin_y as i64;
    let right = left + rect.w as i64;
    let bottom = top + rect.h as i64;

    let clamped_left = left.clamp(0, surface_w as i64);
    let clamped_top = top.clamp(0, surface_h as i64);
    let clamped_right = right.clamp(0, surface_w as i64);
    let clamped_bottom = bottom.clamp(0, surface_h as i64);

    if clamped_right <= clamped_left || clamped_bottom <= clamped_top {
        return None;
    }

    Some(SurfaceRect {
        x: clamped_left as u32,
        y: clamped_top as u32,
        w: (clamped_right - clamped_left) as u32,
        h: (clamped_bottom - clamped_top) as u32,
    })
}

/// A captured region tied to a specific display.
///
/// `display_id` is a platform-specific opaque identifier:
/// - macOS: `CGDirectDisplayID` (u32 widened to u64).
/// - Windows: an interned key over `HMONITOR` (handles aren't stable across
///   reboots, so the front-end resolves them to a stable key on each launch).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatRegion {
    pub display_id: u64,
    pub bounds: Rect,
    /// Hint to the OCR engine. With `auto_detect_language` on (production
    /// default per `spike.swift`), this list is informational only and may
    /// be empty.
    #[serde(default)]
    pub languages: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_rect_to_surface_converts_positive_global_origin() {
        let rect = Rect {
            x: 2_000,
            y: 140,
            w: 300,
            h: 90,
        };
        let crop = clamp_rect_to_surface(rect, 1_920, 100, 1_920, 1_080).unwrap();
        assert_eq!(
            crop,
            SurfaceRect {
                x: 80,
                y: 40,
                w: 300,
                h: 90,
            }
        );
    }

    #[test]
    fn clamp_rect_to_surface_converts_negative_global_origin() {
        let rect = Rect {
            x: -1_850,
            y: 50,
            w: 220,
            h: 80,
        };
        let crop = clamp_rect_to_surface(rect, -1_920, 0, 1_920, 1_080).unwrap();
        assert_eq!(
            crop,
            SurfaceRect {
                x: 70,
                y: 50,
                w: 220,
                h: 80,
            }
        );
    }

    #[test]
    fn clamp_rect_to_surface_clips_partial_overlap() {
        let rect = Rect {
            x: 1_910,
            y: 100,
            w: 40,
            h: 50,
        };
        let crop = clamp_rect_to_surface(rect, 1_920, 0, 1_920, 1_080).unwrap();
        assert_eq!(
            crop,
            SurfaceRect {
                x: 0,
                y: 100,
                w: 30,
                h: 50,
            }
        );
    }

    #[test]
    fn clamp_rect_to_surface_rejects_non_intersection() {
        let rect = Rect {
            x: 4_000,
            y: 0,
            w: 100,
            h: 100,
        };
        assert_eq!(clamp_rect_to_surface(rect, 1_920, 0, 1_920, 1_080), None);
    }
}

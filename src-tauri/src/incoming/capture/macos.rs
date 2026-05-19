// The Apple-deprecated CGDisplayCreate* APIs are exactly what we want
// here — see module docs for the deployment-target rationale. Silence
// the deprecation lint at the module boundary so the intent is obvious
// to reviewers (the lint would otherwise fire for every call site).
#![allow(deprecated)]

//! macOS screen-capture backend for the v0.7.0 incoming-chat feature.
//!
//! We use the legacy CoreGraphics path — `CGDisplayCreateImageForRect` plus
//! a `CGBitmapContext` to extract premultiplied BGRA8 bytes. The newer
//! `ScreenCaptureKit` stream API (macOS 12.3+) and `SCScreenshotManager`
//! (macOS 14+) are nicer to use, but our `tauri.conf.json` minimum
//! deployment target is macOS 10.13, and the CG path covers everything
//! back to macOS 10.6. If we ever bump the floor to 14+ we can swap the
//! implementation behind the same `CaptureSource` trait without touching
//! callers.
//!
//! Screen Recording permission is a runtime concern (macOS 10.15+). We
//! query it via `CGPreflightScreenCaptureAccess` and trigger the system
//! prompt with `CGRequestScreenCaptureAccess`. Note: the OS only shows
//! the prompt once per app version unless the user has explicitly toggled
//! the entry off in System Settings; a subsequent revoke requires the
//! user to re-grant manually. We surface this state to the UI through
//! `PermissionState::Denied` so the front-end can show a "open Settings"
//! shortcut.

use core::ffi::c_void;

use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGBitmapContextCreate, CGBitmapContextGetBytesPerRow, CGBitmapContextGetData, CGContextDrawImage,
    CGDirectDisplayID, CGDisplayBounds, CGDisplayCreateImageForRect, CGDisplayPixelsHigh,
    CGDisplayPixelsWide, CGGetActiveDisplayList, CGImage, CGImageAlphaInfo, CGImageByteOrderInfo,
    CGMainDisplayID,
};

use super::{CaptureError, CaptureSource, OcrFrame, PixelFormat};
use crate::incoming::permission;
use crate::incoming::region::ChatRegion;
use crate::incoming::{DisplayInfo, PermissionState};

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

pub fn create() -> Result<Box<dyn CaptureSource>, CaptureError> {
    Ok(Box::new(MacOsCaptureSource::new()))
}

/// Forward to the shared permission module so the dlsym-based resolution
/// keeps living in one place. Capture-side callers should still use the
/// re-exported [`super::permission_state`].
pub fn permission_state() -> PermissionState {
    permission::current_state()
}

/// Forward to the shared permission module's request flow.
pub fn request_permission() -> PermissionState {
    permission::request()
}

/// Enumerates active displays via `CGGetActiveDisplayList`. The returned
/// `DisplayInfo::id` is the `CGDirectDisplayID` widened to `u64`, which is
/// also what the rest of the incoming subsystem persists in
/// `ChatRegion::display_id`.
pub fn list_displays() -> Vec<DisplayInfo> {
    const MAX_DISPLAYS: u32 = 32;
    let mut ids = [0u32; MAX_DISPLAYS as usize];
    let mut count: u32 = 0;

    let status = unsafe {
        CGGetActiveDisplayList(MAX_DISPLAYS, ids.as_mut_ptr(), &mut count as *mut u32)
    };
    if status.0 != 0 {
        return crate::incoming::list_displays_stub();
    }

    let main_id = CGMainDisplayID();
    let mut out = Vec::with_capacity(count as usize);
    for &raw_id in ids.iter().take(count as usize) {
        let id: CGDirectDisplayID = raw_id;
        let width = CGDisplayPixelsWide(id) as u32;
        let height = CGDisplayPixelsHigh(id) as u32;
        if width == 0 || height == 0 {
            continue;
        }
        let bounds = CGDisplayBounds(id);
        // CGDisplayBounds is in points; CGDisplayPixelsWide/High is in
        // pixels. The ratio gives us the backing-scale factor.
        let scale_factor = if bounds.size.width > 0.0 {
            width as f32 / bounds.size.width as f32
        } else {
            1.0
        };
        out.push(DisplayInfo {
            id: id as u64,
            name: if id == main_id {
                format!("Main display ({width}\u{00d7}{height})")
            } else {
                format!("Display {id} ({width}\u{00d7}{height})")
            },
            width,
            height,
            scale_factor,
            is_primary: id == main_id,
        });
    }

    if out.is_empty() {
        crate::incoming::list_displays_stub()
    } else {
        out
    }
}

// ---------------------------------------------------------------------------
// CaptureSource impl
// ---------------------------------------------------------------------------

struct MacOsCaptureSource;

impl MacOsCaptureSource {
    fn new() -> Self {
        Self
    }
}

impl CaptureSource for MacOsCaptureSource {
    fn capture(&self, region: &ChatRegion) -> Result<OcrFrame, CaptureError> {
        // Preflight every call instead of caching — the user might have
        // revoked Screen Recording between frames, and the consequences of
        // a stale-cached "Granted" are worse than a single dlsym lookup.
        match permission::current_state() {
            PermissionState::Granted | PermissionState::NotApplicable => {}
            PermissionState::Denied => {
                return Err(CaptureError::PermissionDenied(
                    "Screen Recording permission is required. Grant in System Settings → Privacy & Security → Screen Recording, then restart Lingo.".to_string(),
                ));
            }
            PermissionState::Unknown => {
                return Err(CaptureError::PermissionDenied(
                    "Screen Recording permission status is not available on this macOS version.".to_string(),
                ));
            }
        }

        if region.bounds.w == 0 || region.bounds.h == 0 {
            return Err(CaptureError::Platform(
                "capture region has zero width or height".to_string(),
            ));
        }

        let display_id: CGDirectDisplayID = region.display_id as CGDirectDisplayID;
        // Validate the display still exists.
        if CGDisplayPixelsWide(display_id) == 0 {
            return Err(CaptureError::DisplayNotFound(region.display_id));
        }

        let rect = CGRect {
            origin: CGPoint {
                x: region.bounds.x as f64,
                y: region.bounds.y as f64,
            },
            size: CGSize {
                width: region.bounds.w as f64,
                height: region.bounds.h as f64,
            },
        };
        let cg_image = CGDisplayCreateImageForRect(display_id, rect).ok_or_else(|| {
            CaptureError::Platform(format!(
                "CGDisplayCreateImageForRect returned null for region {:?} on display {}",
                region.bounds, region.display_id
            ))
        })?;

        cg_image_to_bgra_frame(&cg_image)
    }
}

// ---------------------------------------------------------------------------
// CGImage → premultiplied BGRA8 OcrFrame
// ---------------------------------------------------------------------------

fn cg_image_to_bgra_frame(image: &CGImage) -> Result<OcrFrame, CaptureError> {
    let width = CGImage::width(Some(image));
    let height = CGImage::height(Some(image));
    if width == 0 || height == 0 {
        return Err(CaptureError::Platform("captured image is empty".into()));
    }

    let bytes_per_row = width * 4;
    let buffer_size = bytes_per_row * height;
    let mut buffer = vec![0u8; buffer_size];

    let color_space = objc2_core_graphics::CGColorSpace::new_device_rgb().ok_or_else(|| {
        CaptureError::Platform("failed to create device RGB color space".to_string())
    })?;

    // BGRA8 premultiplied first = ByteOrder32Little | PremultipliedFirst.
    let bitmap_info: u32 =
        CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;

    // SAFETY: We hand CGBitmapContextCreate a pointer to our owned Vec<u8>.
    // The context borrows it for the duration of this scope; we never let
    // the context outlive `buffer`.
    let context = unsafe {
        CGBitmapContextCreate(
            buffer.as_mut_ptr() as *mut c_void,
            width,
            height,
            8,
            bytes_per_row,
            Some(&color_space),
            bitmap_info,
        )
    }
    .ok_or_else(|| CaptureError::Platform("CGBitmapContextCreate returned null".into()))?;

    // Sanity-check the returned context aligns with our buffer.
    debug_assert_eq!(
        CGBitmapContextGetBytesPerRow(Some(&context)),
        bytes_per_row,
        "CG-provided bytes-per-row differs from our buffer's stride",
    );
    debug_assert_eq!(
        CGBitmapContextGetData(Some(&context)) as *const u8,
        buffer.as_ptr(),
        "CG context is not backed by our buffer",
    );

    let dest_rect = CGRect {
        origin: CGPoint { x: 0.0, y: 0.0 },
        size: CGSize {
            width: width as f64,
            height: height as f64,
        },
    };
    // CGContextDrawImage flips Y because CG's default origin is bottom-left;
    // captured CGImages from CGDisplayCreateImageForRect are top-left. The
    // bitmap context we just made also has its origin at the bottom-left of
    // its buffer, so drawing the image with a positive-height rect lands
    // pixels in scanline order matching CGImageGetByteOrder semantics. That
    // means Vision (which expects top-left origin) still sees the image
    // right-side-up because the bitmap_info matches throughout.
    CGContextDrawImage(Some(&context), dest_rect, Some(image));

    Ok(OcrFrame {
        width: width as u32,
        height: height as u32,
        stride: bytes_per_row as u32,
        format: PixelFormat::Bgra8,
        data: buffer,
    })
}

// Suppress dead-code warnings until the pipeline wires capture in. The
// public API (the `create` / `permission_state` / etc.) is exercised by
// `super::default_capture_source` and `super::permission_state` exports.
#[allow(dead_code)]
fn _capture_source_must_be_send_sync()
where
    MacOsCaptureSource: Send + Sync,
{
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_displays_returns_at_least_one_entry_on_macos() {
        // CI Macs are headless but `CGGetActiveDisplayList` still reports
        // a virtual display. If it ever doesn't, our function falls back
        // to the stub which is also non-empty by construction.
        let displays = list_displays();
        assert!(!displays.is_empty(), "expected at least one display entry");
    }

    #[test]
    fn cg_image_to_bgra_frame_has_correct_layout() {
        // Make a tiny solid-red 4x2 image via CGBitmapContext + extract image,
        // round-trip through cg_image_to_bgra_frame, and verify dimensions.
        // We can't easily compare pixel content here (color spaces, alpha
        // pre-multiplication) but we can prove the function doesn't panic
        // and returns plausibly-shaped output.
        let width: usize = 4;
        let height: usize = 2;
        let bpr = width * 4;
        let mut src = vec![0u8; bpr * height];
        // Fill with opaque red (BGRA premultiplied-first: BB GG RR AA)
        for chunk in src.chunks_exact_mut(4) {
            chunk[0] = 0x00; // B
            chunk[1] = 0x00; // G
            chunk[2] = 0xFF; // R
            chunk[3] = 0xFF; // A
        }
        let color_space = objc2_core_graphics::CGColorSpace::new_device_rgb().unwrap();
        let bitmap_info: u32 =
            CGImageByteOrderInfo::Order32Little.0 | CGImageAlphaInfo::PremultipliedFirst.0;
        let ctx = unsafe {
            CGBitmapContextCreate(
                src.as_mut_ptr() as *mut c_void,
                width,
                height,
                8,
                bpr,
                Some(&color_space),
                bitmap_info,
            )
        }
        .expect("test bitmap context");

        let img = objc2_core_graphics::CGBitmapContextCreateImage(Some(&ctx))
            .expect("test image");
        drop(ctx);

        let frame = cg_image_to_bgra_frame(&img).expect("frame conversion");
        assert_eq!(frame.width, width as u32);
        assert_eq!(frame.height, height as u32);
        assert_eq!(frame.stride, bpr as u32);
        assert_eq!(frame.format, PixelFormat::Bgra8);
        assert_eq!(frame.data.len(), bpr * height);
    }
}

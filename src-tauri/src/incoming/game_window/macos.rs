//! macOS game-window detection via `CGWindowListCopyWindowInfo`.
//!
//! We intentionally use a narrow local FFI surface instead of enabling the
//! `objc2-core-graphics/CGWindow` Cargo feature. The feature also hard-links
//! Screen Recording permission symbols that are unavailable before macOS 10.15;
//! this module only needs the long-available window-list APIs.

use core::ffi::{c_char, c_void};
use std::ffi::CStr;
use std::ptr;

use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::{
    CGDirectDisplayID, CGDisplayBounds, CGGetActiveDisplayList, CGMainDisplayID,
};

use super::{matches_signature, DebugWindowEntry, GameWindow, SIGNATURES};
use crate::incoming::region::Rect;

type Boolean = u8;
type CFArrayRef = *const c_void;
type CFDictionaryRef = *const c_void;
type CFNumberRef = *const c_void;
type CFStringRef = *const c_void;
type CFTypeRef = *const c_void;
type CFIndex = isize;

const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
const K_CF_NUMBER_SINT32_TYPE: CFIndex = 3;
const K_CF_NUMBER_SINT64_TYPE: CFIndex = 4;
const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: u32 = 1 << 0;
const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C-unwind" {
    static kCGWindowBounds: CFStringRef;
    static kCGWindowLayer: CFStringRef;
    static kCGWindowName: CFStringRef;
    static kCGWindowNumber: CFStringRef;
    static kCGWindowOwnerName: CFStringRef;

    fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CFArrayRef;
    fn CGRectMakeWithDictionaryRepresentation(dict: CFDictionaryRef, rect: *mut CGRect) -> Boolean;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C-unwind" {
    fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
    fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> *const c_void;
    fn CFDictionaryGetValue(the_dict: CFDictionaryRef, key: *const c_void) -> *const c_void;
    fn CFNumberGetValue(number: CFNumberRef, the_type: CFIndex, value_ptr: *mut c_void) -> Boolean;
    fn CFRelease(cf: CFTypeRef);
    fn CFStringGetCString(
        the_string: CFStringRef,
        buffer: *mut c_char,
        buffer_size: CFIndex,
        encoding: u32,
    ) -> Boolean;
    fn CFStringGetCStringPtr(the_string: CFStringRef, encoding: u32) -> *const c_char;
}

#[derive(Debug, Clone)]
struct MacWindowEntry {
    window_number: i64,
    owner_name: String,
    title: String,
    bounds: Rect,
}

pub fn detect_current() -> Option<GameWindow> {
    best_matching_window(enumerate_windows())
}

pub fn enumerate_all_for_debug() -> Vec<DebugWindowEntry> {
    enumerate_windows()
        .into_iter()
        .map(|entry| {
            let process_name_lc = entry.owner_name.to_lowercase();
            let matched_game_id = matching_signature(&entry).map(|s| s.game_id);
            DebugWindowEntry {
                hwnd: entry.window_number as isize,
                class: String::new(),
                title: entry.title,
                process_name: entry.owner_name,
                process_name_lc,
                matched_game_id,
            }
        })
        .collect()
}

fn matching_signature(entry: &MacWindowEntry) -> Option<&'static super::GameSignature> {
    let process_name_lc = entry.owner_name.to_lowercase();
    let title = title_for_matching(entry);
    SIGNATURES
        .iter()
        .find(|sig| matches_signature(sig, &process_name_lc, "", title))
}

fn title_for_matching(entry: &MacWindowEntry) -> &str {
    if entry.title.trim().is_empty() {
        &entry.owner_name
    } else {
        &entry.title
    }
}

fn best_matching_window(entries: impl IntoIterator<Item = MacWindowEntry>) -> Option<GameWindow> {
    entries
        .into_iter()
        .filter_map(|entry| {
            let sig = matching_signature(&entry)?;
            Some(GameWindow {
                game_id: sig.game_id,
                bounds: entry.bounds,
                display_id: display_id_for_rect(entry.bounds),
                // `kCGWindowListOptionOnScreenOnly` omits minimised windows.
                minimised: false,
            })
        })
        .max_by_key(|window| window.bounds.w as u64 * window.bounds.h as u64)
}

fn enumerate_windows() -> Vec<MacWindowEntry> {
    let options =
        K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
    let array = unsafe { CGWindowListCopyWindowInfo(options, 0) };
    if array.is_null() {
        return Vec::new();
    }

    let mut out = Vec::new();
    let count = unsafe { CFArrayGetCount(array) };
    for idx in 0..count {
        let dict = unsafe { CFArrayGetValueAtIndex(array, idx) } as CFDictionaryRef;
        if dict.is_null() {
            continue;
        }
        if let Some(entry) = window_entry_from_dict(dict) {
            out.push(entry);
        }
    }
    unsafe {
        CFRelease(array);
    }
    out
}

fn window_entry_from_dict(dict: CFDictionaryRef) -> Option<MacWindowEntry> {
    let layer = cf_number_i32(dict_value(dict, unsafe { kCGWindowLayer }))?;
    if layer != 0 {
        return None;
    }

    let owner_name = cf_string(dict_value(dict, unsafe { kCGWindowOwnerName }));
    if owner_name.trim().is_empty() {
        return None;
    }

    let bounds = rect_from_dict(dict_value(dict, unsafe { kCGWindowBounds }) as CFDictionaryRef)?;
    if bounds.w == 0 || bounds.h == 0 {
        return None;
    }

    Some(MacWindowEntry {
        window_number: cf_number_i64(dict_value(dict, unsafe { kCGWindowNumber })).unwrap_or(0),
        owner_name,
        title: cf_string(dict_value(dict, unsafe { kCGWindowName })),
        bounds,
    })
}

fn dict_value(dict: CFDictionaryRef, key: CFStringRef) -> CFTypeRef {
    if dict.is_null() || key.is_null() {
        return ptr::null();
    }
    unsafe { CFDictionaryGetValue(dict, key.cast()) }
}

fn cf_string(value: CFTypeRef) -> String {
    if value.is_null() {
        return String::new();
    }

    let ptr = unsafe { CFStringGetCStringPtr(value as CFStringRef, K_CF_STRING_ENCODING_UTF8) };
    if !ptr.is_null() {
        return unsafe { CStr::from_ptr(ptr) }
            .to_string_lossy()
            .into_owned();
    }

    let mut buf = [0 as c_char; 1024];
    let ok = unsafe {
        CFStringGetCString(
            value as CFStringRef,
            buf.as_mut_ptr(),
            buf.len() as CFIndex,
            K_CF_STRING_ENCODING_UTF8,
        )
    };
    if ok == 0 {
        String::new()
    } else {
        unsafe { CStr::from_ptr(buf.as_ptr()) }
            .to_string_lossy()
            .into_owned()
    }
}

fn cf_number_i32(value: CFTypeRef) -> Option<i32> {
    if value.is_null() {
        return None;
    }
    let mut out = 0_i32;
    let ok = unsafe {
        CFNumberGetValue(
            value as CFNumberRef,
            K_CF_NUMBER_SINT32_TYPE,
            (&mut out as *mut i32).cast(),
        )
    };
    (ok != 0).then_some(out)
}

fn cf_number_i64(value: CFTypeRef) -> Option<i64> {
    if value.is_null() {
        return None;
    }
    let mut out = 0_i64;
    let ok = unsafe {
        CFNumberGetValue(
            value as CFNumberRef,
            K_CF_NUMBER_SINT64_TYPE,
            (&mut out as *mut i64).cast(),
        )
    };
    (ok != 0).then_some(out)
}

fn rect_from_dict(value: CFDictionaryRef) -> Option<Rect> {
    if value.is_null() {
        return None;
    }
    let mut rect = CGRect {
        origin: CGPoint { x: 0.0, y: 0.0 },
        size: CGSize {
            width: 0.0,
            height: 0.0,
        },
    };
    let ok = unsafe { CGRectMakeWithDictionaryRepresentation(value, &mut rect as *mut CGRect) };
    if ok == 0 {
        return None;
    }
    Some(Rect {
        x: rect.origin.x.round() as i32,
        y: rect.origin.y.round() as i32,
        w: rect.size.width.max(0.0).round() as u32,
        h: rect.size.height.max(0.0).round() as u32,
    })
}

fn display_id_for_rect(rect: Rect) -> u64 {
    let displays = active_display_bounds();
    best_display_for_rect(rect, &displays).unwrap_or_else(|| CGMainDisplayID() as u64)
}

fn active_display_bounds() -> Vec<(u64, Rect)> {
    const MAX_DISPLAYS: u32 = 32;
    let mut ids = [0_u32; MAX_DISPLAYS as usize];
    let mut count = 0_u32;

    let status =
        unsafe { CGGetActiveDisplayList(MAX_DISPLAYS, ids.as_mut_ptr(), &mut count as *mut u32) };
    if status.0 != 0 {
        return Vec::new();
    }

    ids.iter()
        .take(count as usize)
        .filter_map(|raw_id| {
            let id: CGDirectDisplayID = *raw_id;
            let bounds = CGDisplayBounds(id);
            let rect = Rect {
                x: bounds.origin.x.round() as i32,
                y: bounds.origin.y.round() as i32,
                w: bounds.size.width.max(0.0).round() as u32,
                h: bounds.size.height.max(0.0).round() as u32,
            };
            (rect.w > 0 && rect.h > 0).then_some((id as u64, rect))
        })
        .collect()
}

fn best_display_for_rect(rect: Rect, displays: &[(u64, Rect)]) -> Option<u64> {
    displays
        .iter()
        .filter_map(|(id, display)| {
            let area = intersection_area(rect, *display);
            (area > 0).then_some((*id, area))
        })
        .max_by_key(|(_, area)| *area)
        .map(|(id, _)| id)
}

fn intersection_area(a: Rect, b: Rect) -> u64 {
    let left = (a.x as i64).max(b.x as i64);
    let top = (a.y as i64).max(b.y as i64);
    let right = (a.x as i64 + a.w as i64).min(b.x as i64 + b.w as i64);
    let bottom = (a.y as i64 + a.h as i64).min(b.y as i64 + b.h as i64);
    if right <= left || bottom <= top {
        0
    } else {
        ((right - left) as u64) * ((bottom - top) as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(owner_name: &str, title: &str) -> MacWindowEntry {
        MacWindowEntry {
            window_number: 1,
            owner_name: owner_name.to_string(),
            title: title.to_string(),
            bounds: Rect {
                x: 0,
                y: 0,
                w: 1920,
                h: 1080,
            },
        }
    }

    #[test]
    fn matching_signature_accepts_dota_owner_when_title_empty() {
        let sig = matching_signature(&entry("Dota 2", ""));
        assert_eq!(sig.map(|s| s.game_id), Some(super::super::GameId::Dota2));
    }

    #[test]
    fn matching_signature_accepts_lol_owner_when_title_empty() {
        let sig = matching_signature(&entry("League of Legends", ""));
        assert_eq!(
            sig.map(|s| s.game_id),
            Some(super::super::GameId::LeagueOfLegends)
        );
    }

    #[test]
    fn matching_signature_rejects_unrelated_window_title() {
        assert!(matching_signature(&entry("Safari", "Dota 2 wiki")).is_none());
    }

    #[test]
    fn best_matching_window_prefers_the_game_surface_over_smaller_windows() {
        let mut small = entry("Dota 2", "Dota 2");
        small.bounds.w = 640;
        small.bounds.h = 360;
        let large = entry("Dota 2", "Dota 2");

        let detected = best_matching_window([small, large]).unwrap();
        assert_eq!(detected.bounds.w, 1920);
        assert_eq!(detected.bounds.h, 1080);
    }

    #[test]
    fn best_display_prefers_largest_intersection() {
        let displays = vec![
            (
                1,
                Rect {
                    x: 0,
                    y: 0,
                    w: 1920,
                    h: 1080,
                },
            ),
            (
                2,
                Rect {
                    x: 1920,
                    y: 0,
                    w: 1920,
                    h: 1080,
                },
            ),
        ];
        let window = Rect {
            x: 1800,
            y: 0,
            w: 1000,
            h: 800,
        };
        assert_eq!(best_display_for_rect(window, &displays), Some(2));
    }

    #[test]
    fn intersection_area_handles_negative_origins() {
        let display = Rect {
            x: -1920,
            y: 0,
            w: 1920,
            h: 1080,
        };
        let window = Rect {
            x: -1800,
            y: 100,
            w: 500,
            h: 300,
        };
        assert_eq!(intersection_area(window, display), 150_000);
    }
}

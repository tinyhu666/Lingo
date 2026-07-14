//! Windows screen-capture backend for the v0.7.0 incoming-chat feature.
//!
//! Uses `Windows.Graphics.Capture` (WGC) end-to-end:
//!
//! 1. Enumerate displays via `EnumDisplayMonitors` (Win32 GDI).
//! 2. Map a stable `display_id` to an HMONITOR. The brief calls this out
//!    explicitly: HMONITOR handle values are NOT stable across reboots,
//!    so we intern over the device name from `MONITORINFOEXW.szDevice`
//!    (`\\.\DISPLAY1`, `\\.\DISPLAY2`, …) and hash to a `u64`.
//! 3. On each `capture()`:
//!    - Create a D3D11 device with BGRA support.
//!    - Wrap it as `IDirect3DDevice` via `CreateDirect3D11DeviceFromDXGIDevice`.
//!    - Build a `GraphicsCaptureItem` for the target HMONITOR via the
//!      `IGraphicsCaptureItemInterop` static.
//!    - Create a `Direct3D11CaptureFramePool` and `GraphicsCaptureSession`,
//!      start it, poll `TryGetNextFrame` until the first frame lands
//!      (typically <16 ms on a 60Hz display).
//!    - `CopySubresourceRegion` from the frame texture into a CPU staging
//!      texture sized to `region.bounds`.
//!    - Map the staging texture and copy out BGRA8 bytes.
//!    - Tear down (frame pool, session, d3d device).
//!
//! No screen-recording permission prompt is required on Windows 10 1903+
//! for `CreateForMonitor` — the OS treats whole-monitor capture as
//! user-consented at install time. (Per-window capture via `CreateForWindow`
//! would prompt; we don't use that path.)
//!
//! WGC's yellow capture border around monitors is suppressed via
//! `GraphicsCaptureSession::IsBorderRequired(false)` where the host supports
//! the property (Win 11 Sun Valley+); on older builds the border is shown
//! and there isn't much we can do about it short of dropping to BitBlt.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use windows::core::{Interface, BOOL};
use windows::Graphics::Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem};
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Direct3D::{D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL_11_0};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D, D3D11_BOX,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
};
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;

/// `windows::Win32::UI::WindowsAndMessaging::MONITORINFOF_PRIMARY` value
/// (defined inline to avoid pulling a UI feature flag we don't otherwise
/// need). Stable per Win32 ABI since the NT days.
const MONITORINFOF_PRIMARY_FLAG: u32 = 1;

use super::{CaptureError, CaptureSource, OcrFrame, PixelFormat};
use crate::incoming::region::{clamp_rect_to_surface, ChatRegion, SurfaceRect};
use crate::incoming::{DisplayInfo, PermissionState};

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

pub fn create() -> Result<Box<dyn CaptureSource>, CaptureError> {
    Ok(Box::new(WindowsCaptureSource::new()))
}

pub fn permission_state() -> PermissionState {
    PermissionState::NotApplicable
}

pub fn request_permission() -> PermissionState {
    PermissionState::NotApplicable
}

/// Enumerate active monitors via `EnumDisplayMonitors`. The returned
/// `DisplayInfo::id` is a stable u64 derived from `szDevice`
/// (`\\.\DISPLAY1`, etc.), so calibrated regions persist across reboots
/// even though the underlying HMONITOR value rotates.
pub fn list_displays() -> Vec<DisplayInfo> {
    let monitors = enumerate_monitors();
    if monitors.is_empty() {
        return crate::incoming::list_displays_stub();
    }
    monitors
        .into_iter()
        .map(|m| {
            let width = (m.rect.right - m.rect.left).max(0) as u32;
            let height = (m.rect.bottom - m.rect.top).max(0) as u32;
            let pretty_name = humanize_device_name(&m.device_name);
            DisplayInfo {
                id: m.id,
                name: format!(
                    "{}{} ({}\u{00d7}{})",
                    pretty_name,
                    if m.is_primary { " (primary)" } else { "" },
                    width,
                    height,
                ),
                width,
                height,
                origin_x: m.rect.left,
                origin_y: m.rect.top,
                // Per-monitor DPI is queryable via GetDpiForMonitor but
                // adds complexity for marginal value — the drag-to-select
                // UI works in physical pixels on Windows, which is what
                // EnumDisplayMonitors already gives us. Report 1.0 and
                // revisit if HiDPI calibration goes sideways.
                scale_factor: 1.0,
                is_primary: m.is_primary,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Monitor enumeration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct MonitorEntry {
    id: u64,
    hmonitor: HMONITOR,
    rect: RECT,
    device_name: String,
    is_primary: bool,
}

fn enumerate_monitors() -> Vec<MonitorEntry> {
    let mut entries: Vec<MonitorEntry> = Vec::new();
    let raw_ptr: *mut Vec<MonitorEntry> = &mut entries;
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(enum_monitor_callback),
            LPARAM(raw_ptr as isize),
        );
    }
    entries
}

unsafe extern "system" fn enum_monitor_callback(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let entries = unsafe { &mut *(lparam.0 as *mut Vec<MonitorEntry>) };
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if unsafe { GetMonitorInfoW(hmonitor, &mut info.monitorInfo as *mut _).as_bool() } {
        let device_name = String::from_utf16_lossy(
            &info
                .szDevice
                .iter()
                .take_while(|&&c| c != 0)
                .cloned()
                .collect::<Vec<u16>>(),
        );
        let is_primary = (info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY_FLAG) != 0;
        let id = intern_device_name(&device_name);
        entries.push(MonitorEntry {
            id,
            hmonitor,
            rect: info.monitorInfo.rcMonitor,
            device_name,
            is_primary,
        });
    }
    TRUE
}

/// Hash the device name to a stable u64. We can't just take the HMONITOR
/// value because Windows reassigns those across reboots / GPU driver
/// resets. `\\.\DISPLAY<n>` IS stable for as long as the cabling stays
/// the same; that's good enough for chat-region calibration.
fn intern_device_name(name: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    // Force the top bit off so callers don't accidentally try to interpret
    // the id as a signed value and produce negative numbers.
    hasher.finish() & 0x7FFF_FFFF_FFFF_FFFF
}

/// Public alias for [`intern_device_name`] so the `game_window::windows`
/// detector can build display ids that match `list_displays()` output —
/// the pipeline relies on both id spaces being identical to source the
/// right `CaptureSource` frame for the detected game's monitor.
pub fn intern_device_name_pub(name: &str) -> u64 {
    intern_device_name(name)
}

fn humanize_device_name(device_name: &str) -> String {
    // `\\.\DISPLAY1` -> "DISPLAY1", `\\.\DISPLAY2` -> "DISPLAY2". The
    // GetMonitorInfo struct doesn't carry the EDID-derived friendly name;
    // getting it would require IDXGIOutput6 or DisplayConfig APIs which
    // is overkill for v0.7.0. The user can still distinguish "Primary"
    // vs "DISPLAY2" from the flag.
    device_name
        .strip_prefix(r"\\.\")
        .unwrap_or(device_name)
        .to_string()
}

fn resolve_monitor(id: u64) -> Option<MonitorEntry> {
    enumerate_monitors().into_iter().find(|m| m.id == id)
}

// ---------------------------------------------------------------------------
// WindowsCaptureSource
// ---------------------------------------------------------------------------

struct WindowsCaptureSource {
    // Mutex<()> only to discourage concurrent capture from the same source;
    // we don't actually share state but D3D11 device creation isn't cheap
    // and bare-mass concurrent calls would burn cycles for no benefit.
    _serializer: Mutex<()>,
}

impl WindowsCaptureSource {
    fn new() -> Self {
        Self {
            _serializer: Mutex::new(()),
        }
    }
}

impl CaptureSource for WindowsCaptureSource {
    fn capture(&self, region: &ChatRegion) -> Result<OcrFrame, CaptureError> {
        if region.bounds.w == 0 || region.bounds.h == 0 {
            return Err(CaptureError::Platform(
                "capture region has zero width or height".to_string(),
            ));
        }
        let _g = self._serializer.lock().unwrap_or_else(|p| p.into_inner());

        let monitor = resolve_monitor(region.display_id)
            .ok_or(CaptureError::DisplayNotFound(region.display_id))?;

        // ----- D3D11 device ------------------------------------------------
        let (d3d_device, context) = create_d3d11_device()?;
        let dxgi_device: IDXGIDevice = d3d_device
            .cast()
            .map_err(|e| CaptureError::Platform(format!("ID3D11Device::cast<IDXGIDevice>: {e}")))?;
        let direct3d_device = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device) }
            .map_err(|e| {
                CaptureError::Platform(format!("CreateDirect3D11DeviceFromDXGIDevice: {e}"))
            })?;
        let direct3d_device: windows::Graphics::DirectX::Direct3D11::IDirect3DDevice =
            direct3d_device.cast().map_err(|e| {
                CaptureError::Platform(format!("IInspectable::cast<IDirect3DDevice>: {e}"))
            })?;

        // ----- GraphicsCaptureItem -----------------------------------------
        let interop: IGraphicsCaptureItemInterop =
            windows::core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().map_err(
                |e| CaptureError::Platform(format!("factory<IGraphicsCaptureItemInterop>: {e}")),
            )?;
        let item: GraphicsCaptureItem = unsafe {
            interop
                .CreateForMonitor(monitor.hmonitor)
                .map_err(|e| CaptureError::Platform(format!("CreateForMonitor: {e}")))?
        };
        let item_size = item
            .Size()
            .map_err(|e| CaptureError::Platform(format!("GraphicsCaptureItem::Size: {e}")))?;

        // ----- Frame pool + session ----------------------------------------
        // The incoming pipeline runs on Tauri's async worker pool, where no
        // UI DispatcherQueue exists. CreateFreeThreaded is the WGC API meant
        // for this exact background-thread setup.
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &direct3d_device,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            2,
            item_size,
        )
        .map_err(|e| CaptureError::Platform(format!("FramePool::Create: {e}")))?;
        let session = pool
            .CreateCaptureSession(&item)
            .map_err(|e| CaptureError::Platform(format!("CreateCaptureSession: {e}")))?;
        // Suppress the yellow border where the OS supports the toggle.
        // Older builds will return E_NOTIMPL; ignore.
        let _ = session.SetIsBorderRequired(false);
        let _ = session.SetIsCursorCaptureEnabled(false);
        session
            .StartCapture()
            .map_err(|e| CaptureError::Platform(format!("StartCapture: {e}")))?;

        // ----- Wait for the first frame ------------------------------------
        // ~16ms typical at 60Hz; bail out after ~1s so a stuck monitor
        // doesn't wedge the pipeline forever.
        let frame = poll_first_frame(&pool)?;
        let surface = frame
            .Surface()
            .map_err(|e| CaptureError::Platform(format!("frame.Surface: {e}")))?;
        let dxgi_access: IDirect3DDxgiInterfaceAccess = surface
            .cast()
            .map_err(|e| CaptureError::Platform(format!("Surface::cast: {e}")))?;
        let frame_tex: ID3D11Texture2D = unsafe { dxgi_access.GetInterface() }.map_err(|e| {
            CaptureError::Platform(format!("DxgiInterfaceAccess::GetInterface: {e}"))
        })?;

        // Tear down capture as soon as we have the texture — the staging
        // copy below doesn't need the pool/session alive.
        let _ = session.Close();
        let _ = pool.Close();

        // ----- Crop into a CPU staging texture -----------------------------
        let (mw, mh) = monitor_pixel_size(item_size);
        let cb = clamp_rect(region, monitor.rect, mw, mh)?;
        let staging = create_staging_texture(&d3d_device, cb.w, cb.h)?;
        let src_box = D3D11_BOX {
            left: cb.x,
            top: cb.y,
            front: 0,
            right: cb.x + cb.w,
            bottom: cb.y + cb.h,
            back: 1,
        };
        unsafe {
            context.CopySubresourceRegion(&staging, 0, 0, 0, 0, &frame_tex, 0, Some(&src_box));
        }

        // ----- Map staging and copy bytes out ------------------------------
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        unsafe {
            context
                .Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
                .map_err(|e| CaptureError::Platform(format!("Map(staging): {e}")))?;
        }
        let stride = mapped.RowPitch;
        let mut data: Vec<u8> = Vec::with_capacity((stride * cb.h) as usize);
        // SAFETY: D3D11 guarantees pData is valid for RowPitch * height bytes
        // while the texture is mapped. We copy bytes out and unmap promptly.
        unsafe {
            let src = mapped.pData as *const u8;
            let len = (stride * cb.h) as usize;
            data.extend_from_slice(std::slice::from_raw_parts(src, len));
            context.Unmap(&staging, 0);
        }

        Ok(OcrFrame {
            width: cb.w,
            height: cb.h,
            stride,
            format: PixelFormat::Bgra8,
            data,
        })
    }
}

// ---------------------------------------------------------------------------
// D3D helpers
// ---------------------------------------------------------------------------

fn create_d3d11_device() -> Result<(ID3D11Device, ID3D11DeviceContext), CaptureError> {
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    let feature_levels = [D3D_FEATURE_LEVEL_11_0];
    let mut actual_level = D3D_FEATURE_LEVEL_11_0;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            Some(&feature_levels),
            D3D11_SDK_VERSION,
            Some(&mut device),
            Some(&mut actual_level),
            Some(&mut context),
        )
    }
    .map_err(|e| CaptureError::Platform(format!("D3D11CreateDevice: {e}")))?;
    Ok((
        device.ok_or_else(|| {
            CaptureError::Platform("D3D11CreateDevice returned null device".into())
        })?,
        context.ok_or_else(|| {
            CaptureError::Platform("D3D11CreateDevice returned null context".into())
        })?,
    ))
}

fn create_staging_texture(
    device: &ID3D11Device,
    w: u32,
    h: u32,
) -> Result<ID3D11Texture2D, CaptureError> {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: w,
        Height: h,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut tex: Option<ID3D11Texture2D> = None;
    unsafe { device.CreateTexture2D(&desc, None, Some(&mut tex)) }
        .map_err(|e| CaptureError::Platform(format!("CreateTexture2D(staging): {e}")))?;
    tex.ok_or_else(|| CaptureError::Platform("CreateTexture2D returned null".into()))
}

// ---------------------------------------------------------------------------
// Frame polling
// ---------------------------------------------------------------------------

fn poll_first_frame(
    pool: &Direct3D11CaptureFramePool,
) -> Result<windows::Graphics::Capture::Direct3D11CaptureFrame, CaptureError> {
    // Frame arrival is event-driven, but for a one-shot capture we can
    // busy-poll TryGetNextFrame at sub-millisecond granularity. The WinRT
    // binding surfaces "no frame yet" as an Err (the COM ABI returns
    // null and `from_abi` rejects it). We retry on every error until
    // we get a real Direct3D11CaptureFrame OR exceed ~1s — at which
    // point the monitor is probably asleep / unplugged.
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(1_000);
    let mut last_err: Option<windows::core::Error>;
    loop {
        match pool.TryGetNextFrame() {
            Ok(frame) => return Ok(frame),
            Err(e) => last_err = Some(e),
        }
        if start.elapsed() > timeout {
            return Err(CaptureError::Platform(format!(
                "timed out waiting for first frame from Windows.Graphics.Capture (1s); last error: {}",
                last_err
                    .map(|e| e.to_string())
                    .unwrap_or_else(|| "<none>".into())
            )));
        }
        std::thread::sleep(std::time::Duration::from_millis(1));
    }
}

// ---------------------------------------------------------------------------
// Region clamping
// ---------------------------------------------------------------------------

fn monitor_pixel_size(size: windows::Graphics::SizeInt32) -> (u32, u32) {
    (size.Width.max(0) as u32, size.Height.max(0) as u32)
}

fn clamp_rect(
    region: &ChatRegion,
    monitor_rect: RECT,
    mw: u32,
    mh: u32,
) -> Result<SurfaceRect, CaptureError> {
    // Auto-detected game windows use global virtual-desktop coordinates.
    // WGC monitor textures use monitor-local coordinates, so subtract the
    // selected monitor origin before building D3D11_BOX. A local fallback
    // preserves older manually-picked regions that were already saved
    // relative to the monitor.
    let crop = clamp_rect_to_surface(region.bounds, monitor_rect.left, monitor_rect.top, mw, mh)
        .or_else(|| clamp_rect_to_surface(region.bounds, 0, 0, mw, mh))
        .ok_or_else(|| {
            CaptureError::Platform(format!(
                "region {:?} does not intersect monitor ({}, {}) {}x{}",
                region.bounds, monitor_rect.left, monitor_rect.top, mw, mh
            ))
        })?;
    Ok(crop)
}

#[allow(dead_code)]
fn _capture_source_must_be_send_sync()
where
    WindowsCaptureSource: Send + Sync,
{
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::incoming::region::Rect;

    #[test]
    fn intern_device_name_is_stable_for_same_input() {
        let a = intern_device_name(r"\\.\DISPLAY1");
        let b = intern_device_name(r"\\.\DISPLAY1");
        assert_eq!(a, b);
    }

    #[test]
    fn intern_device_name_differs_for_distinct_displays() {
        let a = intern_device_name(r"\\.\DISPLAY1");
        let b = intern_device_name(r"\\.\DISPLAY2");
        assert_ne!(a, b);
    }

    #[test]
    fn intern_device_name_top_bit_is_zero() {
        // Callers may assume id fits in an i64 for serialization safety.
        let id = intern_device_name(r"\\.\DISPLAY1");
        assert_eq!(id >> 63, 0);
    }

    #[test]
    fn humanize_strips_dos_device_prefix() {
        assert_eq!(humanize_device_name(r"\\.\DISPLAY1"), "DISPLAY1");
        assert_eq!(humanize_device_name(r"\\.\DISPLAY2"), "DISPLAY2");
        assert_eq!(humanize_device_name("ODD"), "ODD"); // pass-through
    }

    #[test]
    fn clamp_rect_caps_overflow() {
        let r = ChatRegion {
            display_id: 0,
            bounds: Rect {
                x: 50,
                y: 50,
                w: 1000,
                h: 1000,
            },
            languages: vec![],
        };
        let c = clamp_rect(
            &r,
            RECT {
                left: 0,
                top: 0,
                right: 800,
                bottom: 600,
            },
            800,
            600,
        )
        .expect("should clamp");
        assert_eq!(c.x, 50);
        assert_eq!(c.y, 50);
        assert_eq!(c.w, 750); // 800 - 50
        assert_eq!(c.h, 550); // 600 - 50
    }

    #[test]
    fn clamp_rect_rejects_origin_outside_monitor() {
        let r = ChatRegion {
            display_id: 0,
            bounds: Rect {
                x: 2000,
                y: 0,
                w: 100,
                h: 100,
            },
            languages: vec![],
        };
        assert!(clamp_rect(
            &r,
            RECT {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
            },
            1920,
            1080,
        )
        .is_err());
    }

    #[test]
    fn clamp_rect_converts_global_secondary_monitor_coordinates() {
        let r = ChatRegion {
            display_id: 0,
            bounds: Rect {
                x: 2000,
                y: 140,
                w: 300,
                h: 90,
            },
            languages: vec![],
        };
        let c = clamp_rect(
            &r,
            RECT {
                left: 1920,
                top: 100,
                right: 3840,
                bottom: 1180,
            },
            1920,
            1080,
        )
        .expect("global rect should map into monitor-local crop");
        assert_eq!(c.x, 80);
        assert_eq!(c.y, 40);
        assert_eq!(c.w, 300);
        assert_eq!(c.h, 90);
    }

    #[test]
    fn clamp_rect_converts_global_negative_monitor_coordinates() {
        let r = ChatRegion {
            display_id: 0,
            bounds: Rect {
                x: -1850,
                y: 50,
                w: 220,
                h: 80,
            },
            languages: vec![],
        };
        let c = clamp_rect(
            &r,
            RECT {
                left: -1920,
                top: 0,
                right: 0,
                bottom: 1080,
            },
            1920,
            1080,
        )
        .expect("negative global rect should map into monitor-local crop");
        assert_eq!(c.x, 70);
        assert_eq!(c.y, 50);
        assert_eq!(c.w, 220);
        assert_eq!(c.h, 80);
    }

    #[test]
    fn list_displays_returns_at_least_one_entry_on_windows() {
        // CI runners under "session 0" don't have a real monitor, so
        // EnumDisplayMonitors may return 0 entries. We fall back to the
        // stub in that case, which is non-empty by construction.
        let ds = list_displays();
        assert!(!ds.is_empty());
    }
}

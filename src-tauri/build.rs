use std::{env, fs, path::PathBuf};

fn remove_cached_icon(profile: &str, file_name: &str) {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is not set"));
    let cached_icon_path = manifest_dir
        .join("target")
        .join(profile)
        .join("resources")
        .join(file_name);

    if cached_icon_path.exists() {
        let _ = fs::remove_file(cached_icon_path);
    }
}

fn main() {
    for path in [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.ico",
        "icons/icon.icns",
        "icons/icon.png",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }

    for profile in ["debug", "release"] {
        for file_name in ["icon.ico", "icon.icns", "icon.png"] {
            remove_cached_icon(profile, file_name);
        }
    }

    tauri_build::build()
}

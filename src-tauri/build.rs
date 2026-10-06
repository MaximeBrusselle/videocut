fn main() {
  #[cfg(feature = "bundled")]
  compress_sidecars();
  tauri_build::build()
}

/// Compresses the ffmpeg/ffprobe binaries into OUT_DIR so `ffmpeg.rs` can embed them.
#[cfg(feature = "bundled")]
fn compress_sidecars() {
  use std::{env, fs, path::PathBuf};

  let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
  let mut lens = String::new();
  for tool in ["ffmpeg", "ffprobe"] {
    let src = format!("binaries/{tool}-x86_64-pc-windows-msvc.exe");
    println!("cargo:rerun-if-changed={src}");
    let raw = fs::read(&src).unwrap_or_else(|e| panic!("{src}: {e}"));
    let packed = zstd::encode_all(raw.as_slice(), 19).unwrap();
    fs::write(out.join(format!("{tool}.zst")), packed).unwrap();
    lens.push_str(&format!("pub const {}_LEN: u64 = {};\n", tool.to_uppercase(), raw.len()));
  }
  fs::write(out.join("embedded_lens.rs"), lens).unwrap();
}

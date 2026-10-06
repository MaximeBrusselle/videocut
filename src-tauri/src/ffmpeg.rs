use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// Holds the running export so `cancel` can kill it.
#[derive(Default)]
pub struct ExportState {
    child: Mutex<Option<Child>>,
    cancelled: AtomicBool,
}

/// A `Command` that does not flash a console window on Windows.
pub fn command(tool: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(tool);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

pub fn spawn_error(tool: &str, err: std::io::Error) -> String {
    if err.kind() == std::io::ErrorKind::NotFound {
        format!("{tool} was not found on PATH. Install FFmpeg and make sure `{tool}` works in a terminal.")
    } else {
        format!("Could not start {tool}: {err}")
    }
}

/// `out_time_us=<n>` -> microseconds. Other lines, `N/A` and negatives -> None.
pub fn parse_progress_line(line: &str) -> Option<u64> {
    let value = line.trim().strip_prefix("out_time_us=")?;
    value.parse::<i64>().ok().filter(|v| *v >= 0).map(|v| v as u64)
}

pub fn percent(out_time_us: u64, duration_s: f64) -> f64 {
    if duration_s <= 0.0 {
        return 0.0;
    }
    ((out_time_us as f64 / 1e6) / duration_s * 100.0).clamp(0.0, 100.0)
}

/// Runs ffmpeg with `args`, emitting `progress` events (0-100). Err("cancelled") when cancelled.
pub fn run_export(
    app: &AppHandle,
    state: &ExportState,
    args: &[String],
    duration_s: f64,
    output: &str,
) -> Result<(), String> {
    state.cancelled.store(false, Ordering::SeqCst);
    let mut child = command("ffmpeg")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| spawn_error("ffmpeg", e))?;
    let stdout = child.stdout.take().ok_or("ffmpeg gave no stdout")?;
    let stderr = child.stderr.take().ok_or("ffmpeg gave no stderr")?;
    *state.child.lock().unwrap() = Some(child);

    let tail = Arc::new(Mutex::new(VecDeque::<String>::new()));
    let tail_writer = Arc::clone(&tail);
    let stderr_thread = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let mut lines = tail_writer.lock().unwrap();
            if lines.len() == 10 {
                lines.pop_front();
            }
            lines.push_back(line);
        }
    });

    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        if let Some(us) = parse_progress_line(&line) {
            let _ = app.emit("progress", percent(us, duration_s));
        }
    }
    let _ = stderr_thread.join();

    let child = state.child.lock().unwrap().take();
    let status = match child {
        Some(mut c) => c.wait().map_err(|e| e.to_string())?,
        None => return Err("ffmpeg process disappeared".into()),
    };

    if state.cancelled.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(output);
        return Err("cancelled".into());
    }
    if status.success() {
        let _ = app.emit("progress", 100.0);
        Ok(())
    } else {
        let tail_text = tail.lock().unwrap().iter().cloned().collect::<Vec<_>>().join("\n");
        let _ = std::fs::remove_file(output);
        Err(format!("ffmpeg failed ({status}):\n{tail_text}"))
    }
}

pub fn cancel(state: &ExportState) {
    state.cancelled.store(true, Ordering::SeqCst);
    if let Some(child) = state.child.lock().unwrap().as_mut() {
        let _ = child.kill();
    }
}

/// Small H.264 copy (540p, no audio) used only for scrubbing when the webview can't play the source.
pub fn make_proxy(input: &str, output: &Path) -> Result<(), String> {
    let out = command("ffmpeg")
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(input)
        .args([
            "-vf", "scale=-2:540", "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
            "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
        ])
        .arg(output)
        .output()
        .map_err(|e| spawn_error("ffmpeg", e))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Could not create the preview copy:\n{}",
            String::from_utf8_lossy(&out.stderr).trim()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_out_time_us() {
        assert_eq!(parse_progress_line("out_time_us=2933333"), Some(2_933_333));
        assert_eq!(parse_progress_line("  out_time_us=0\r"), Some(0));
    }

    #[test]
    fn ignores_other_lines() {
        assert_eq!(parse_progress_line("out_time_us=N/A"), None);
        assert_eq!(parse_progress_line("out_time_us=-9223372036854775807"), None);
        assert_eq!(parse_progress_line("frame=12"), None);
        assert_eq!(parse_progress_line("progress=end"), None);
    }

    #[test]
    fn computes_percent() {
        assert_eq!(percent(1_500_000, 3.0), 50.0);
        assert_eq!(percent(9_000_000, 3.0), 100.0);
        assert_eq!(percent(1, 0.0), 0.0);
    }

    #[test]
    fn explains_a_missing_tool() {
        let err = std::io::Error::from(std::io::ErrorKind::NotFound);
        assert!(spawn_error("ffmpeg", err).contains("not found on PATH"));
    }
}

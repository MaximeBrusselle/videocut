use crate::ffmpeg::{command, spawn_error};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct RawOutput {
    #[serde(default)]
    streams: Vec<RawStream>,
    format: Option<RawFormat>,
}

#[derive(Deserialize)]
struct RawFormat {
    duration: Option<String>,
}

#[derive(Deserialize)]
struct RawStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    avg_frame_rate: Option<String>,
    color_space: Option<String>,
    color_primaries: Option<String>,
    color_transfer: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub color_space: Option<String>,
    pub color_primaries: Option<String>,
    pub color_transfer: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub duration: f64,
    pub video: Option<VideoInfo>,
    pub has_audio: bool,
}

fn parse_rate(rate: &str) -> f64 {
    match rate.split_once('/') {
        Some((num, den)) => {
            let num = num.parse::<f64>().unwrap_or(0.0);
            let den = den.parse::<f64>().unwrap_or(0.0);
            if den > 0.0 {
                num / den
            } else {
                0.0
            }
        }
        None => rate.parse().unwrap_or(0.0),
    }
}

fn known(value: Option<String>) -> Option<String> {
    value.filter(|v| v != "unknown")
}

pub fn parse_probe(json: &str) -> Result<MediaInfo, String> {
    let raw: RawOutput =
        serde_json::from_str(json).map_err(|e| format!("Could not read ffprobe output: {e}"))?;
    let duration = raw
        .format
        .and_then(|f| f.duration)
        .and_then(|d| d.parse::<f64>().ok())
        .ok_or("The file has no readable duration.")?;
    let has_audio = raw
        .streams
        .iter()
        .any(|s| s.codec_type.as_deref() == Some("audio"));
    let video = raw
        .streams
        .into_iter()
        .find(|s| s.codec_type.as_deref() == Some("video"))
        .and_then(|s| {
            let fps = s
                .avg_frame_rate
                .as_deref()
                .map(parse_rate)
                .filter(|r| *r > 0.0)
                .or_else(|| s.r_frame_rate.as_deref().map(parse_rate))
                .unwrap_or(0.0);
            Some(VideoInfo {
                width: s.width?,
                height: s.height?,
                fps,
                codec: s.codec_name.unwrap_or_default(),
                color_space: known(s.color_space),
                color_primaries: known(s.color_primaries),
                color_transfer: known(s.color_transfer),
            })
        });
    Ok(MediaInfo {
        duration,
        video,
        has_audio,
    })
}

pub fn probe(path: &str) -> Result<MediaInfo, String> {
    let out = command("ffprobe")
        .args(["-v", "error", "-print_format", "json", "-show_format", "-show_streams"])
        .arg(path)
        .output()
        .map_err(|e| spawn_error("ffprobe", e))?;
    if !out.status.success() {
        return Err(format!(
            "ffprobe could not read the file:\n{}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    parse_probe(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "streams": [
            {"codec_type":"video","codec_name":"h264","width":1920,"height":1080,
             "r_frame_rate":"30000/1001","avg_frame_rate":"30000/1001",
             "color_space":"bt709","color_primaries":"bt709","color_transfer":"unknown"},
            {"codec_type":"audio","codec_name":"aac"}
        ],
        "format": {"duration":"12.500000"}
    }"#;

    #[test]
    fn parses_video_and_audio() {
        let info = parse_probe(SAMPLE).unwrap();
        assert!((info.duration - 12.5).abs() < 1e-9);
        assert!(info.has_audio);
        let v = info.video.unwrap();
        assert_eq!((v.width, v.height), (1920, 1080));
        assert!((v.fps - 29.97).abs() < 0.01);
        assert_eq!(v.codec, "h264");
        assert_eq!(v.color_space.as_deref(), Some("bt709"));
        assert_eq!(v.color_transfer, None);
    }

    #[test]
    fn audio_only_file_has_no_video() {
        let json = r#"{"streams":[{"codec_type":"audio","codec_name":"mp3"}],"format":{"duration":"3.0"}}"#;
        let info = parse_probe(json).unwrap();
        assert!(info.video.is_none());
        assert!(info.has_audio);
    }

    #[test]
    fn missing_duration_is_an_error() {
        assert!(parse_probe(r#"{"streams":[],"format":{}}"#).is_err());
    }

    #[test]
    fn parses_frame_rates() {
        assert_eq!(parse_rate("30/1"), 30.0);
        assert_eq!(parse_rate("0/0"), 0.0);
        assert_eq!(parse_rate("25"), 25.0);
    }
}

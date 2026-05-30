use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WatchedFolderSetting {
    id: String,
    path: String,
    recursive: bool,
    enabled: bool,
    stability_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchedFileCandidate {
    watch_folder_id: String,
    path: String,
    filename: String,
    extension: String,
    byte_size: u64,
    modified_at: String,
}

#[tauri::command]
fn watched_text_machine_id(app: AppHandle) -> Result<String, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Unable to resolve app config directory: {error}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("Unable to create app config directory: {error}"))?;
    let machine_id_path = config_dir.join("watched-text-machine-id");
    if machine_id_path.exists() {
        return fs::read_to_string(&machine_id_path)
            .map(|value| value.trim().to_string())
            .map_err(|error| format!("Unable to read machine identity: {error}"));
    }

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Unable to read system time: {error}"))?
        .as_nanos();
    let machine_id = format!("memo-capture-{}-{}", std::process::id(), nanos);
    fs::write(&machine_id_path, &machine_id)
        .map_err(|error| format!("Unable to persist machine identity: {error}"))?;
    Ok(machine_id)
}

#[tauri::command]
fn scan_watched_folders(
    folders: Vec<WatchedFolderSetting>,
) -> Result<Vec<WatchedFileCandidate>, String> {
    let mut candidates = Vec::new();
    for folder in folders.iter().filter(|folder| folder.enabled) {
        let root = PathBuf::from(folder.path.trim());
        if root.as_os_str().is_empty() || !root.is_dir() {
            continue;
        }
        scan_folder(folder, &root, &mut candidates)?;
    }
    candidates.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(candidates)
}

#[tauri::command]
fn scan_watched_text_folders(
    folders: Vec<WatchedFolderSetting>,
) -> Result<Vec<WatchedFileCandidate>, String> {
    scan_watched_folders(folders)
}

#[tauri::command]
fn read_watched_text_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(PathBuf::from(path))
        .map_err(|error| format!("Unable to read watched text file: {error}"))
}

#[tauri::command]
fn read_watched_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(PathBuf::from(path)).map_err(|error| format!("Unable to read watched file: {error}"))
}

#[tauri::command]
fn archive_watched_file(
    original_path: String,
    archive_root: String,
    archive_leaf: String,
) -> Result<String, String> {
    let source = PathBuf::from(original_path);
    if !source.is_file() {
        return Err("Original watched file is not available for archive.".to_string());
    }

    let archive_root = PathBuf::from(archive_root);
    let relative_leaf = PathBuf::from(archive_leaf);
    if relative_leaf.is_absolute()
        || relative_leaf
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Archive leaf must be a relative path inside the archive root.".to_string());
    }

    let requested_target = archive_root.join(relative_leaf);
    fs::create_dir_all(
        requested_target
            .parent()
            .ok_or_else(|| "Archive target has no parent directory.".to_string())?,
    )
    .map_err(|error| format!("Unable to create archive directory: {error}"))?;
    let target = non_overwriting_path(&requested_target);
    move_file(&source, &target)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn archive_watched_text_file(
    original_path: String,
    archive_root: String,
    archive_leaf: String,
) -> Result<String, String> {
    archive_watched_file(original_path, archive_root, archive_leaf)
}

fn scan_folder(
    folder: &WatchedFolderSetting,
    path: &Path,
    candidates: &mut Vec<WatchedFileCandidate>,
) -> Result<(), String> {
    for entry_result in
        fs::read_dir(path).map_err(|error| format!("Unable to read watched folder: {error}"))?
    {
        let entry = entry_result
            .map_err(|error| format!("Unable to inspect watched folder entry: {error}"))?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|error| format!("Unable to inspect watched folder entry metadata: {error}"))?;
        if metadata.is_dir() {
            if folder.recursive {
                scan_folder(folder, &entry_path, candidates)?;
            }
            continue;
        }
        if !metadata.is_file()
            || !is_supported_watched_file(&entry_path)
            || !is_stable(&metadata, folder.stability_ms)
        {
            continue;
        }
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| format_unix_millis(value.as_millis()))
            .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string());
        candidates.push(WatchedFileCandidate {
            watch_folder_id: folder.id.clone(),
            path: entry_path.to_string_lossy().to_string(),
            filename: entry_path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "memo.txt".to_string()),
            extension: entry_path
                .extension()
                .map(|value| format!(".{}", value.to_string_lossy().to_lowercase()))
                .unwrap_or_default(),
            byte_size: metadata.len(),
            modified_at,
        });
    }
    Ok(())
}

fn is_supported_watched_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .map(|value| value.to_string_lossy().to_lowercase()),
        Some(extension)
            if extension == "txt"
                || extension == "md"
                || extension == "markdown"
                || extension == "m4a"
                || extension == "mp3"
                || extension == "wav"
    )
}

fn is_stable(metadata: &fs::Metadata, stability_ms: u64) -> bool {
    let modified = match metadata.modified() {
        Ok(value) => value,
        Err(_) => return false,
    };
    match SystemTime::now().duration_since(modified) {
        Ok(age) => age.as_millis() >= u128::from(stability_ms),
        Err(_) => false,
    }
}

fn non_overwriting_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "archive".to_string());
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_string());
    for suffix in 1.. {
        let filename = match &extension {
            Some(extension) => format!("{stem}-{suffix}.{extension}"),
            None => format!("{stem}-{suffix}"),
        };
        let candidate = parent.join(filename);
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!("suffix loop always returns a candidate")
}

fn move_file(source: &Path, target: &Path) -> Result<(), String> {
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            fs::copy(source, target)
                .map_err(|copy_error| format!("Unable to archive watched file: {rename_error}; copy fallback failed: {copy_error}"))?;
            fs::remove_file(source).map_err(|remove_error| {
                format!(
                    "Archived a copy but could not remove original watched file: {remove_error}"
                )
            })
        }
    }
}

fn format_unix_millis(millis: u128) -> String {
    // Good enough for UI sorting/status; JavaScript displays this as a date.
    format!("{}", millis)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            watched_text_machine_id,
            scan_watched_folders,
            scan_watched_text_folders,
            read_watched_file,
            read_watched_text_file,
            archive_watched_file,
            archive_watched_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Memo Capture desktop app");
}

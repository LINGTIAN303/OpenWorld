//! 工作流设置与维护命令
//!
//! Task 1.5：占位返回；Task 4.4 接入设置面板（retention_days 等）。

use crate::workflow::commands::CommandResult;

#[tauri::command]
pub async fn workflow_get_setting(_key: String) -> CommandResult<Option<String>> {
    Ok(None)
}

#[tauri::command]
pub async fn workflow_set_setting(_key: String, _value: String) -> CommandResult<()> {
    Ok(())
}

#[tauri::command]
pub async fn workflow_purge_runs_now() -> CommandResult<u32> {
    Ok(0)
}

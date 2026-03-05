use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILENAME: &str = "store.json";
const AUTH_KEY: &str = "auth_session";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct AuthSessionPayload {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub user_id: String,
    pub email: String,
    pub email_verified: bool,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub logged_in: bool,
    pub email: Option<String>,
    pub email_verified: bool,
    pub role: String,
    pub token_expired: bool,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            logged_in: false,
            email: None,
            email_verified: false,
            role: "user".to_string(),
            token_expired: false,
        }
    }
}

fn now_epoch_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_secs() as i64)
        .unwrap_or_default()
}

fn normalize_role(role: &str) -> String {
    if role.trim().eq_ignore_ascii_case("admin") {
        "admin".to_string()
    } else {
        "user".to_string()
    }
}

fn read_session(app: &AppHandle) -> Result<Option<AuthSessionPayload>> {
    let store = app.store(STORE_FILENAME)?;
    let value = store.get(AUTH_KEY);

    let session = match value {
        Some(raw) if !raw.is_null() => serde_json::from_value::<AuthSessionPayload>(raw).ok(),
        _ => None,
    };

    Ok(session)
}

fn to_auth_state(session: Option<AuthSessionPayload>) -> AuthState {
    let Some(session) = session else {
        return AuthState::default();
    };

    let expired = session.expires_at > 0 && session.expires_at <= now_epoch_secs();
    let logged_in = !session.access_token.trim().is_empty() && !session.user_id.trim().is_empty();

    if !logged_in {
        return AuthState::default();
    }

    AuthState {
        logged_in: true,
        email: if session.email.trim().is_empty() {
            None
        } else {
            Some(session.email)
        },
        email_verified: session.email_verified,
        role: normalize_role(&session.role),
        token_expired: expired,
    }
}

pub fn set_auth_session(app: &AppHandle, mut payload: AuthSessionPayload) -> Result<AuthState> {
    payload.role = normalize_role(&payload.role);

    let store = app.store(STORE_FILENAME)?;
    store.set(AUTH_KEY, json!(payload));
    store.save()?;

    get_auth_state(app)
}

pub fn clear_auth_session(app: &AppHandle) -> Result<AuthState> {
    let store = app.store(STORE_FILENAME)?;
    store.set(AUTH_KEY, json!(serde_json::Value::Null));
    store.save()?;

    Ok(AuthState::default())
}

pub fn get_auth_state(app: &AppHandle) -> Result<AuthState> {
    let session = read_session(app)?;
    Ok(to_auth_state(session))
}

pub fn require_access_token(app: &AppHandle) -> Result<String> {
    let session = read_session(app)?;
    let Some(session) = session else {
        return Err(anyhow!("请先登录后使用翻译"));
    };

    if session.expires_at > 0 && session.expires_at <= now_epoch_secs() {
        return Err(anyhow!("登录状态已过期，请重新登录"));
    }

    if !session.email_verified {
        return Err(anyhow!("请先验证邮箱后使用翻译"));
    }

    if session.access_token.trim().is_empty() {
        return Err(anyhow!("请先登录后使用翻译"));
    }

    Ok(session.access_token)
}

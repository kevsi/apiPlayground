use crate::mock_matcher;
use crate::mock_types::*;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

struct RateLimitEntry {
    count: u32,
    window_start: u64,
}

struct MockStoreInner {
    routes: Vec<MockRoute>,
    enabled_globally: bool,
    rate_limit_counters: HashMap<String, RateLimitEntry>,
}

/// Result of matching a request against a mock route (without delay applied).
pub struct MockMatch {
    pub delay: u64,
    pub status: u16,
    pub body: String,
    pub headers: Vec<(String, String)>,
    pub duration_ms: u128,
    pub encoding: String,
}

pub struct MockStore {
    inner: Mutex<MockStoreInner>,
    store_path: PathBuf,
}

impl MockStore {
    pub fn new(store_path: PathBuf) -> Self {
        let routes = if store_path.exists() {
            std::fs::read_to_string(&store_path)
                .ok()
                .and_then(|data| serde_json::from_str::<Vec<MockRoute>>(&data).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        MockStore {
            inner: Mutex::new(MockStoreInner {
                routes,
                enabled_globally: true,
                rate_limit_counters: HashMap::new(),
            }),
            store_path,
        }
    }

    // ── Public query / mutation commands ──

    pub fn get_routes(&self) -> Vec<MockRoute> {
        self.inner.lock().unwrap().routes.clone()
    }

    pub fn set_routes(&self, routes: Vec<MockRoute>) {
        let mut inner = self.inner.lock().unwrap();
        inner.routes = routes;
        self.save(&inner);
    }

    pub fn add_route(&self, route: MockRoute) {
        let mut inner = self.inner.lock().unwrap();
        inner.routes.push(route);
        self.save(&inner);
    }

    pub fn update_route(&self, id: &str, route: MockRoute) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap();
        let idx = inner
            .routes
            .iter()
            .position(|r| r.id == id)
            .ok_or_else(|| format!("Route {} not found", id))?;
        inner.routes[idx] = route;
        self.save(&inner);
        Ok(())
    }

    pub fn delete_route(&self, id: &str) {
        let mut inner = self.inner.lock().unwrap();
        inner.routes.retain(|r| r.id != id);
        self.save(&inner);
    }

    pub fn toggle_enabled(&self, id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().unwrap();
        let route = inner
            .routes
            .iter_mut()
            .find(|r| r.id == id)
            .ok_or_else(|| format!("Route {} not found", id))?;
        route.enabled = !route.enabled;
        route.updated_at = now_ms();
        self.save(&inner);
        Ok(())
    }

    pub fn is_mock_enabled_globally(&self) -> bool {
        self.inner.lock().unwrap().enabled_globally
    }

    pub fn set_mock_enabled_globally(&self, enabled: bool) {
        self.inner.lock().unwrap().enabled_globally = enabled;
    }

    // ── Request interception ──

    /// Find a matching mock route for `url` + `method` and build the response.
    /// Does NOT sleep — the caller is responsible for applying the returned delay.
    /// Returns `None` if no route matches, globally disabled, or rate-limited.
    pub fn find_mock_match(&self, method: &str, url: &str) -> Option<MockMatch> {
        let parsed = reqwest::Url::parse(url).ok()?;
        let pathname = parsed.path().to_string();
        let mut inner = self.inner.lock().unwrap();

        if !inner.enabled_globally {
            return None;
        }

        let matched_route = inner
            .routes
            .iter()
            .find(|r| {
                r.enabled
                    && mock_matcher::match_mock_route(method, &pathname, &r.method, &r.path_pattern)
                        .matched
            })
            .cloned();

        let route = match matched_route {
            Some(r) => r,
            None => return None,
        };

        // ── Rate limiting ──
        if let Some(ref rl) = route.rate_limit {
            if rl.enabled {
                let now_secs = now_ms() / 1000;
                let key = format!("rl_{}", route.id);
                let entry = inner
                    .rate_limit_counters
                    .entry(key)
                    .or_insert(RateLimitEntry {
                        count: 0,
                        window_start: now_secs,
                    });

                if now_secs - entry.window_start > rl.window_seconds {
                    entry.count = 1;
                    entry.window_start = now_secs;
                } else if entry.count >= rl.max_requests {
                    drop(inner);
                    return Some(MockMatch {
                        delay: 0,
                        status: 429,
                        body: serde_json::json!({
                            "error": "Too Many Requests",
                            "message": format!("Rate limit exceeded: {} requests per {}s", rl.max_requests, rl.window_seconds),
                            "route": route.name,
                            "retryAfter": rl.window_seconds,
                        })
                        .to_string(),
                        headers: vec![
                            ("x-mock-route".into(), route.id.clone()),
                            ("x-mock-name".into(), route.name.clone()),
                            ("x-mock-rate-limited".into(), "true".into()),
                            ("retry-after".into(), rl.window_seconds.to_string()),
                        ],
                        duration_ms: 0,
                        encoding: "utf8".into(),
                    });
                } else {
                    entry.count += 1;
                }
            }
        }

        // ── Variant selection ──
        let variant = route.variants.as_ref().and_then(|v| pick_variant(v.as_slice()));

        let active_delay = variant.as_ref().map_or(route.delay, |v| v.delay);
        let active_status = variant.as_ref().map_or(route.response_status, |v| v.response_status);
        let active_body = variant.as_ref().map_or(&route.response_body, |v| &v.response_body);
        let active_headers = variant.as_ref().map_or(&route.response_headers, |v| &v.response_headers);

        drop(inner);

        let mut headers: Vec<(String, String)> = vec![
            ("x-mock-route".into(), route.id.clone()),
            ("x-mock-name".into(), route.name.clone()),
            ("x-mock-delay".into(), active_delay.to_string()),
        ];
        for (k, v) in active_headers {
            headers.push((k.clone(), v.clone()));
        }
        if let Some(ref v) = variant {
            headers.push(("x-mock-variant".into(), v.id.clone()));
            headers.push(("x-mock-variant-name".into(), v.name.clone()));
        }

        let start = std::time::Instant::now();

        Some(MockMatch {
            delay: active_delay,
            status: active_status,
            body: active_body.clone(),
            headers,
            duration_ms: start.elapsed().as_millis(),
            encoding: "utf8".into(),
        })
    }

    /// Convenience: find mock match, block for the delay, build the response.
    /// NOTE: The delay blocks the calling thread (Tauri IPC handler).
    /// For long delays this freezes the UI; keep delays reasonable (< 3000ms).
    pub fn handle_mock_request(&self, method: &str, url: &str) -> Option<TauriMockResponse> {
        let mock = self.find_mock_match(method, url)?;

        if mock.delay > 0 {
            std::thread::sleep(std::time::Duration::from_millis(mock.delay));
        }

        Some(TauriMockResponse {
            status: mock.status,
            body: mock.body,
            headers: mock.headers,
            duration_ms: mock.duration_ms + mock.delay as u128,
            encoding: mock.encoding,
            mocked: true,
        })
    }

    // ── Persistence ──

    fn save(&self, inner: &MockStoreInner) {
        if let Ok(data) = serde_json::to_string_pretty(&inner.routes) {
            if let Some(parent) = self.store_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&self.store_path, data);
        }
    }
}

// ── Helpers ──

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Pick a variant by weighted pseudo-random selection using sub-second timing.
fn pick_variant(variants: &[MockRouteVariant]) -> Option<MockRouteVariant> {
    if variants.is_empty() {
        return None;
    }
    let total_weight: u32 = variants.iter().map(|v| v.weight).sum();
    if total_weight == 0 {
        return None;
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let roll = nanos % total_weight;
    let mut acc = 0u32;
    for v in variants {
        acc += v.weight;
        if roll < acc {
            return Some(v.clone());
        }
    }
    variants.last().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_route(id: &str, method: &str, pattern: &str, status: u16) -> MockRoute {
        MockRoute {
            id: id.to_string(),
            name: format!("route {}", id),
            method: method.to_string(),
            path_pattern: pattern.to_string(),
            response_status: status,
            response_headers: HashMap::new(),
            response_body: r#"{"ok":true}"#.to_string(),
            content_type: "application/json".to_string(),
            delay: 0,
            enabled: true,
            collection_id: None,
            collection_name: None,
            rate_limit: None,
            variants: None,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    fn make_rate_limit_route(id: &str, max: u32, window: u64) -> MockRoute {
        MockRoute {
            rate_limit: Some(MockRouteRateLimit {
                enabled: true,
                max_requests: max,
                window_seconds: window,
            }),
            ..make_route(id, "GET", "/api/test", 200)
        }
    }

    #[test]
    fn test_no_match_returns_none() {
        let store = MockStore::new(PathBuf::from(":memory:"));
        store.add_route(make_route("r1", "GET", "/api/users", 200));

        let result = store.find_mock_match("GET", "http://localhost/api/other");
        assert!(result.is_none());

        // handle_mock_request should also return None
        let result2 = store.handle_mock_request("GET", "http://localhost/api/other");
        assert!(result2.is_none());
    }

    #[test]
    fn test_exact_match_returns_mocked_response() {
        let store = MockStore::new(PathBuf::from(":memory:"));
        store.add_route(make_route("r1", "GET", "/api/users", 200));

        let result = store.find_mock_match("GET", "http://localhost/api/users");
        assert!(result.is_some());
        let match_ = result.unwrap();
        assert_eq!(match_.status, 200);
        assert!(match_.headers.iter().any(|(k, _)| k == "x-mock-route"));

        let resp = store.handle_mock_request("GET", "http://localhost/api/users").unwrap();
        assert_eq!(resp.status, 200);
        assert!(resp.mocked);
    }

    #[test]
    fn test_disabled_route_not_matched() {
        let store = MockStore::new(PathBuf::from(":memory:"));
        let mut route = make_route("r1", "GET", "/api/users", 200);
        route.enabled = false;
        store.add_route(route);

        let result = store.find_mock_match("GET", "http://localhost/api/users");
        assert!(result.is_none());
        let result2 = store.handle_mock_request("GET", "http://localhost/api/users");
        assert!(result2.is_none());
    }

    #[test]
    fn test_globally_disabled_returns_none() {
        let store = MockStore::new(PathBuf::from(":memory:"));
        store.add_route(make_route("r1", "GET", "/api/users", 200));
        store.set_mock_enabled_globally(false);

        let result = store.find_mock_match("GET", "http://localhost/api/users");
        assert!(result.is_none());
    }

    #[test]
    fn test_rate_limit_exceeded() {
        let store = MockStore::new(PathBuf::from(":memory:"));
        store.add_route(make_rate_limit_route("r1", 2, 60));

        // First two via find_mock_match should succeed
        let r1 = store.find_mock_match("GET", "http://localhost/api/test").unwrap();
        assert_eq!(r1.status, 200);

        let r2 = store.find_mock_match("GET", "http://localhost/api/test").unwrap();
        assert_eq!(r2.status, 200);

        // Third should be rate-limited (find_mock_match returns 429)
        let r3 = store.find_mock_match("GET", "http://localhost/api/test").unwrap();
        assert_eq!(r3.status, 429);

        // handle_mock_request also returns 429
        let r4 = store.handle_mock_request("GET", "http://localhost/api/test").unwrap();
        assert_eq!(r4.status, 429);
        assert!(r4.mocked);
    }

    #[test]
    fn test_crud_operations() {
        let store = MockStore::new(PathBuf::from(":memory:"));

        let route = make_route("r1", "GET", "/api/items", 200);
        store.add_route(route);
        assert_eq!(store.get_routes().len(), 1);

        let mut updated = make_route("r1", "POST", "/api/items", 201);
        updated.name = "updated".to_string();
        store.update_route("r1", updated).unwrap();
        assert_eq!(store.get_routes()[0].name, "updated");

        store.delete_route("r1");
        assert!(store.get_routes().is_empty());
    }

    #[test]
    fn test_toggle_enabled() {
        let store = MockStore::new(PathBuf::from(":memory:"));
        store.add_route(make_route("r1", "GET", "/api/items", 200));
        assert!(store.get_routes()[0].enabled);

        store.toggle_enabled("r1").unwrap();
        assert!(!store.get_routes()[0].enabled);

        store.toggle_enabled("r1").unwrap();
        assert!(store.get_routes()[0].enabled);
    }
}

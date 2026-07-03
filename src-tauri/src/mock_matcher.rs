//! Legacy mock route matcher. Deprecated in favor of Mockoon CLI sidecar.

use std::collections::HashMap;

#[derive(Debug, PartialEq)]
pub struct PathMatchResult {
    pub matched: bool,
    pub params: HashMap<String, String>,
}

/// Matches a request method + pathname against a mock route pattern.
///
/// Patterns support `:param` segments:
///   `/api/users/:id`         → matches `/api/users/42`        → { "id": "42" }
///   `/api/users/:id/posts`   → matches `/api/users/42/posts`  → { "id": "42" }
///   `/api/users/*`           → matches any `/api/users/...`    → { "*": "..." }
///
/// Method matching: GET matches GET. Wildcard `"*"` matches any method.
pub fn match_mock_route(
    request_method: &str,
    request_pathname: &str,
    request_query: &HashMap<String, String>,
    request_headers: &HashMap<String, String>,
    route_method: &str,
    route_pattern: &str,
    route_query: Option<&HashMap<String, String>>,
    route_headers: Option<&HashMap<String, String>>,
) -> PathMatchResult {
    let normalized_request = normalize_path(request_pathname);
    let normalized_pattern = normalize_path(route_pattern);

    // Method matching
    let method_match = route_method == "*"
        || route_method.to_uppercase() == request_method.to_uppercase();
    if !method_match {
        return no_match();
    }

    // Path matching — split into segments
    let request_segments: Vec<&str> = normalized_request
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    let pattern_segments: Vec<&str> = normalized_pattern
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // If pattern has trailing wildcard, allow extra segments
    let has_wildcard = pattern_segments
        .last()
        .map(|&s| s == "*")
        .unwrap_or(false);

    if !has_wildcard && request_segments.len() != pattern_segments.len() {
        return no_match();
    }

    if has_wildcard && request_segments.len() < pattern_segments.len() - 1 {
        return no_match();
    }

    let mut params = HashMap::new();

    for i in 0..pattern_segments.len() {
        let pattern_segment = pattern_segments[i];

        if pattern_segment == "*" {
            params.insert("*".to_string(), request_segments[i..].join("/"));
            break;
        }

        if let Some(param_name) = pattern_segment.strip_prefix(':') {
            let value = request_segments.get(i).copied().unwrap_or("");
            params.insert(param_name.to_string(), value.to_string());
            continue;
        }

        match request_segments.get(i) {
            Some(seg) if *seg == pattern_segment => continue,
            _ => return no_match(),
        }
    }

    if let Some(expected_headers) = route_headers {
        for (k, expected_v) in expected_headers {
            let k_lower = k.to_lowercase();
            let req_v = request_headers.get(&k_lower).map(|s| s.as_str()).unwrap_or("");
            if expected_v != "*" && req_v != expected_v {
                return no_match();
            }
        }
    }

    if let Some(expected_query) = route_query {
        for (k, expected_v) in expected_query {
            let req_v = request_query.get(k).map(|s| s.as_str()).unwrap_or("");
            if expected_v != "*" && req_v != expected_v {
                return no_match();
            }
        }
    }

    PathMatchResult {
        matched: true,
        params,
    }
}

fn normalize_path(path: &str) -> String {
    let p = path.trim();
    if p != "/" && p.ends_with('/') {
        p[..p.len() - 1].to_string()
    } else {
        p.to_string()
    }
}

fn no_match() -> PathMatchResult {
    PathMatchResult {
        matched: false,
        params: HashMap::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_literal_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/users", &q, &h, "GET", "/api/users", None, None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_param_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/users/42", &q, &h, "GET", "/api/users/:id", None, None);
        assert_result(result, true, &[("id", "42")]);
    }

    #[test]
    fn test_wildcard_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/users/42/posts/5", &q, &h, "GET", "/api/users/*", None, None);
        assert_result(result, true, &[("*", "42/posts/5")]);
    }

    #[test]
    fn test_method_wildcard_matches_any_method() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("POST", "/api/anything", &q, &h, "*", "/api/anything", None, None);
        assert_result(result, true, &[]);

        let result = match_mock_route("DELETE", "/api/anything", &q, &h, "*", "/api/anything", None, None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_wrong_method_returns_no_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("POST", "/api/users", &q, &h, "GET", "/api/users", None, None);
        assert!(!result.matched);
    }

    #[test]
    fn test_wrong_path_returns_no_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/other", &q, &h, "GET", "/api/users", None, None);
        assert!(!result.matched);
    }

    #[test]
    fn test_multiple_params() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route(
            "GET",
            "/api/users/42/posts/5",
            &q, &h,
            "GET",
            "/api/users/:userId/posts/:postId",
            None, None
        );
        assert_result(result, true, &[("userId", "42"), ("postId", "5")]);
    }

    #[test]
    fn test_trailing_slash_normalized() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/users/", &q, &h, "GET", "/api/users", None, None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_root_path() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/", &q, &h, "GET", "/", None, None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_pattern_too_short_no_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/users/42/extra", &q, &h, "GET", "/api/users/:id", None, None);
        assert!(!result.matched);
    }

    #[test]
    fn test_pattern_too_long_no_match() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/users/42", &q, &h, "GET", "/api/users/:id/extra", None, None);
        assert!(!result.matched);
    }

    #[test]
    fn test_wildcard_with_no_extra() {
        let q = HashMap::new();
        let h = HashMap::new();
        // * matches zero extra segments
        let result = match_mock_route("GET", "/api/users", &q, &h, "GET", "/api/users/*", None, None);
        assert!(result.matched);
        assert_eq!(result.params.get("*").unwrap(), "");
    }

    #[test]
    fn test_wildcard_needs_at_least_base() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api", &q, &h, "GET", "/api/users/*", None, None);
        assert!(!result.matched);
    }

    #[test]
    fn test_empty_path() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("GET", "", &q, &h, "GET", "/", None, None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_case_insensitive_method() {
        let q = HashMap::new();
        let h = HashMap::new();
        let result = match_mock_route("get", "/api/users", &q, &h, "GET", "/api/users", None, None);
        assert_result(result, true, &[]);

        let result = match_mock_route("GET", "/api/users", &q, &h, "get", "/api/users", None, None);
        assert_result(result, true, &[]);
    }

    // ── Query param matching tests ──

    #[test]
    fn test_query_param_exact_match() {
        let q = HashMap::from([("q".to_string(), "test".to_string())]);
        let route_q = HashMap::from([("q".to_string(), "test".to_string())]);
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/search", &q, &h, "GET", "/api/search", Some(&route_q), None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_query_param_mismatch_rejected() {
        let q = HashMap::from([("q".to_string(), "other".to_string())]);
        let route_q = HashMap::from([("q".to_string(), "test".to_string())]);
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/search", &q, &h, "GET", "/api/search", Some(&route_q), None);
        assert!(!result.matched);
    }

    #[test]
    fn test_query_param_wildcard_matches_any() {
        let q = HashMap::from([("q".to_string(), "anything".to_string())]);
        let route_q = HashMap::from([("q".to_string(), "*".to_string())]);
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/search", &q, &h, "GET", "/api/search", Some(&route_q), None);
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_query_param_missing_on_request_rejected() {
        let q = HashMap::new();
        let route_q = HashMap::from([("q".to_string(), "test".to_string())]);
        let h = HashMap::new();
        let result = match_mock_route("GET", "/api/search", &q, &h, "GET", "/api/search", Some(&route_q), None);
        assert!(!result.matched);
    }

    // ── Header matching tests ──

    #[test]
    fn test_header_exact_match_case_insensitive() {
        let q = HashMap::new();
        let req_h = HashMap::from([("x-api-key".to_string(), "secret".to_string())]);
        let route_h = HashMap::from([("X-Api-Key".to_string(), "secret".to_string())]);
        let result = match_mock_route("GET", "/api/users", &q, &req_h, "GET", "/api/users", None, Some(&route_h));
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_header_mismatch_rejected() {
        let q = HashMap::new();
        let req_h = HashMap::from([("x-api-key".to_string(), "wrong".to_string())]);
        let route_h = HashMap::from([("x-api-key".to_string(), "secret".to_string())]);
        let result = match_mock_route("GET", "/api/users", &q, &req_h, "GET", "/api/users", None, Some(&route_h));
        assert!(!result.matched);
    }

    #[test]
    fn test_header_wildcard_matches_any_value() {
        let q = HashMap::new();
        let req_h = HashMap::from([("Authorization".to_string(), "Bearer token123".to_string())]);
        let route_h = HashMap::from([("Authorization".to_string(), "*".to_string())]);
        let result = match_mock_route("GET", "/api/users", &q, &req_h, "GET", "/api/users", None, Some(&route_h));
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_header_missing_on_request_rejected() {
        let q = HashMap::new();
        let req_h = HashMap::new();
        let route_h = HashMap::from([("x-api-key".to_string(), "secret".to_string())]);
        let result = match_mock_route("GET", "/api/users", &q, &req_h, "GET", "/api/users", None, Some(&route_h));
        assert!(!result.matched);
    }

    #[test]
    fn test_multiple_headers_all_must_match() {
        let q = HashMap::new();
        let req_h = HashMap::from([
            ("x-api-key".to_string(), "secret".to_string()),
            ("x-role".to_string(), "admin".to_string()),
        ]);
        let route_h = HashMap::from([
            ("x-api-key".to_string(), "secret".to_string()),
            ("x-role".to_string(), "admin".to_string()),
        ]);
        let result = match_mock_route("GET", "/api/admin", &q, &req_h, "GET", "/api/admin", None, Some(&route_h));
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_multiple_headers_one_wrong_rejected() {
        let q = HashMap::new();
        let req_h = HashMap::from([
            ("x-api-key".to_string(), "secret".to_string()),
            ("x-role".to_string(), "user".to_string()),
        ]);
        let route_h = HashMap::from([
            ("x-api-key".to_string(), "secret".to_string()),
            ("x-role".to_string(), "admin".to_string()),
        ]);
        let result = match_mock_route("GET", "/api/admin", &q, &req_h, "GET", "/api/admin", None, Some(&route_h));
        assert!(!result.matched);
    }

    fn assert_result(
        result: PathMatchResult,
        expected_matched: bool,
        expected_params: &[(&str, &str)],
    ) {
        assert_eq!(result.matched, expected_matched, "matched status mismatch");
        if expected_matched {
            for (key, value) in expected_params {
                assert_eq!(
                    result.params.get(*key),
                    Some(&value.to_string()),
                    "param '{}' mismatch",
                    key
                );
            }
            assert_eq!(result.params.len(), expected_params.len(), "param count mismatch");
        }
    }
}

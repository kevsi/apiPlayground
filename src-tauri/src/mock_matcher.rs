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
    route_method: &str,
    route_pattern: &str,
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
        let result = match_mock_route("GET", "/api/users", "GET", "/api/users");
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_param_match() {
        let result = match_mock_route("GET", "/api/users/42", "GET", "/api/users/:id");
        assert_result(result, true, &[("id", "42")]);
    }

    #[test]
    fn test_wildcard_match() {
        let result = match_mock_route("GET", "/api/users/42/posts/5", "GET", "/api/users/*");
        assert_result(result, true, &[("*", "42/posts/5")]);
    }

    #[test]
    fn test_method_wildcard_matches_any_method() {
        let result = match_mock_route("POST", "/api/anything", "*", "/api/anything");
        assert_result(result, true, &[]);

        let result = match_mock_route("DELETE", "/api/anything", "*", "/api/anything");
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_wrong_method_returns_no_match() {
        let result = match_mock_route("POST", "/api/users", "GET", "/api/users");
        assert!(!result.matched);
    }

    #[test]
    fn test_wrong_path_returns_no_match() {
        let result = match_mock_route("GET", "/api/other", "GET", "/api/users");
        assert!(!result.matched);
    }

    #[test]
    fn test_multiple_params() {
        let result = match_mock_route(
            "GET",
            "/api/users/42/posts/5",
            "GET",
            "/api/users/:userId/posts/:postId",
        );
        assert_result(result, true, &[("userId", "42"), ("postId", "5")]);
    }

    #[test]
    fn test_trailing_slash_normalized() {
        let result = match_mock_route("GET", "/api/users/", "GET", "/api/users");
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_root_path() {
        let result = match_mock_route("GET", "/", "GET", "/");
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_pattern_too_short_no_match() {
        let result = match_mock_route("GET", "/api/users/42/extra", "GET", "/api/users/:id");
        assert!(!result.matched);
    }

    #[test]
    fn test_pattern_too_long_no_match() {
        let result = match_mock_route("GET", "/api/users/42", "GET", "/api/users/:id/extra");
        assert!(!result.matched);
    }

    #[test]
    fn test_wildcard_with_no_extra() {
        // * matches zero extra segments
        let result = match_mock_route("GET", "/api/users", "GET", "/api/users/*");
        assert!(result.matched);
        assert_eq!(result.params.get("*").unwrap(), "");
    }

    #[test]
    fn test_wildcard_needs_at_least_base() {
        let result = match_mock_route("GET", "/api", "GET", "/api/users/*");
        assert!(!result.matched);
    }

    #[test]
    fn test_empty_path() {
        let result = match_mock_route("GET", "", "GET", "/");
        assert_result(result, true, &[]);
    }

    #[test]
    fn test_case_insensitive_method() {
        let result = match_mock_route("get", "/api/users", "GET", "/api/users");
        assert_result(result, true, &[]);

        let result = match_mock_route("GET", "/api/users", "get", "/api/users");
        assert_result(result, true, &[]);
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

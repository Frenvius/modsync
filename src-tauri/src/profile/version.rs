use semver::Version;

pub fn has_newer_version(installed: &str, latest: &str) -> bool {
    let Ok(installed_v) = parse_version(installed) else {
        return false;
    };
    let Ok(latest_v) = parse_version(latest) else {
        return false;
    };
    latest_v > installed_v
}

fn parse_version(v: &str) -> Result<Version, semver::Error> {
    if let Ok(parsed) = Version::parse(v) {
        return Ok(parsed);
    }
    let stripped = v.strip_prefix('v').unwrap_or(v);
    Version::parse(stripped)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_newer_version() {
        assert!(has_newer_version("1.0.0", "1.0.1"));
        assert!(has_newer_version("1.0.0", "2.0.0"));
        assert!(!has_newer_version("1.0.1", "1.0.0"));
        assert!(!has_newer_version("1.0.0", "1.0.0"));
        assert!(!has_newer_version("bad", "1.0.0"));
        assert!(!has_newer_version("1.0.0", "bad"));
    }
}
